import { randomUUID } from 'node:crypto';
import {
  Chat,
  Photo,
  RawDocument,
  Video,
  type Message,
  type TelegramClient,
  type TextWithEntities,
} from '@mtcute/node';
import PQueue from 'p-queue';
import { FileDatabase } from './database.js';
import { generateCode } from './security.js';
import { telegramKey, telegramLocation } from './telegram-chat.js';
import type { SyncStatus } from '../shared/settings.js';
import { imageDimensions } from './media-dimensions.js';
import { mediaKind } from '../shared/media.js';

const videoExtensions: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'image/gif': '.gif',
};

export interface SavedDocument {
  peerId: number;
  id: number;
  name: string;
  size: number;
  mime: string;
  createdAt: number;
  caption: TextWithEntities;
  editable?: boolean;
  width?: number;
  height?: number;
}

export interface TelegramSyncPort {
  dimensions?(
    peerId: number,
    id: number,
  ): Promise<{ width: number; height: number } | undefined>;
  history(peerId: number): AsyncIterable<SavedDocument>;
  read(peerId: number, id: number): Promise<SavedDocument | null>;
  subscribe(listener: (file: SavedDocument) => void): () => void;
  edit(peerId: number, id: number, caption: TextWithEntities): Promise<void>;
}

export function captionWithCode(
  caption: TextWithEntities,
  code: string,
  previousCode?: string,
): TextWithEntities {
  const existing = caption.entities?.some(
    (entity) =>
      entity._ === 'messageEntityCode' &&
      caption.text.slice(entity.offset, entity.offset + entity.length) === code,
  );
  if (existing) return caption;
  const previous = caption.entities?.find(
    (entity) =>
      entity._ === 'messageEntityCode' &&
      entity.offset + entity.length === caption.text.length &&
      (entity.offset === 0 ||
        caption.text.slice(0, entity.offset).endsWith('\n\n')) &&
      (caption.text.slice(entity.offset) === previousCode ||
        /^[2-9A-HJ-NP-Z]{4}(?:-[2-9A-HJ-NP-Z]{4}){2,3}$/.test(
          caption.text.slice(entity.offset),
        )),
  );
  if (previous) {
    const delta = code.length - previous.length;
    return {
      text: caption.text.slice(0, previous.offset) + code,
      entities: caption.entities?.map((entity) =>
        entity === previous
          ? { ...entity, length: code.length }
          : entity.offset + entity.length > previous.offset
            ? { ...entity, length: entity.length + delta }
            : entity,
      ),
    };
  }
  const prefix = caption.text ? `${caption.text}\n\n` : '';
  return {
    text: `${prefix}${code}`,
    entities: [
      ...(caption.entities ?? []),
      { _: 'messageEntityCode', offset: prefix.length, length: code.length },
    ],
  };
}

export function telegramSyncPort(
  client: Pick<
    TelegramClient,
    | 'iterHistory'
    | 'onNewMessage'
    | 'editMessage'
    | 'getMessages'
    | 'downloadAsNodeStream'
  >,
): TelegramSyncPort {
  const normalize = (message: Message): SavedDocument | null => {
    if (!(
      message.media instanceof RawDocument || message.media instanceof Photo
    ))
      return null;
    const media = message.media;
    const size = media.fileSize;
    if (!size || size > Number.MAX_SAFE_INTEGER) return null;
    const photo = media instanceof Photo;
    const mime = photo ? 'image/jpeg' : media.mimeType;
    const name = photo
      ? `photo-${message.id}.jpg`
      : (media.fileName ??
        (media instanceof Video
          ? `video-${message.id}${videoExtensions[mime] ?? ''}`
          : `file-${message.id}`));
    const imageSize =
      media instanceof RawDocument
        ? media.raw.attributes.find(
            (attr) => attr._ === 'documentAttributeImageSize',
          )
        : undefined;
    const dimensions =
      media instanceof Photo || media instanceof Video
        ? { width: media.width, height: media.height }
        : imageSize
          ? { width: imageSize.w, height: imageSize.h }
          : undefined;
    const chat = message.chat;
    return {
      peerId: chat.id,
      id: message.id,
      name,
      size,
      mime,
      ...dimensions,
      createdAt: message.date.getTime(),
      caption: message.textWithEntities,
      editable:
        message.forward === null &&
        (message.isOutgoing ||
          (message.isChannelPost &&
            chat instanceof Chat &&
            (chat.isCreator || chat.adminRights?.editMessages === true))),
    };
  };
  return {
    async read(peerId, id) {
      const [message] = await client.getMessages(peerId, id);
      return message?.chat.id === peerId ? normalize(message) : null;
    },
    async dimensions(peerId, id) {
      const [message] = await client.getMessages(peerId, id);
      if (!(message?.media instanceof RawDocument)) return undefined;
      const source = client.downloadAsNodeStream(message.media);
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of source) {
          if (!(chunk instanceof Uint8Array))
            throw new Error('invalid file chunk');
          const bytes = Buffer.from(chunk.subarray(0, 262144 - size));
          chunks.push(bytes);
          size += bytes.length;
          if (size >= 262144) break;
          try {
            return imageDimensions(Buffer.concat(chunks));
          } catch {
            /* more header bytes may be needed. */
          }
        }
        return imageDimensions(Buffer.concat(chunks));
      } finally {
        source.destroy();
      }
    },
    async *history(peerId) {
      for await (const message of client.iterHistory(peerId, {
        chunkSize: 100,
      })) {
        const file = normalize(message);
        if (file?.peerId === peerId) yield file;
      }
    },
    subscribe(listener) {
      const callback = (message: Message) => {
        const file = normalize(message);
        if (file) listener(file);
      };
      client.onNewMessage.add(callback);
      return () => client.onNewMessage.remove(callback);
    },
    async edit(peerId, id, text) {
      await client.editMessage({ chatId: peerId, message: id, text });
    },
  };
}

export class TelegramSync {
  private queue = new PQueue({ concurrency: 1 });
  private closed = false;
  private unsubscribe?: () => void;
  private scans = new Set<number>();
  private failures = new Map<number, string>();

  constructor(
    private port: TelegramSyncPort,
    private db: FileDatabase,
  ) {}

  private enabled(peerId: number) {
    return this.db.readSettings().sources.some(({ id }) => id === peerId);
  }

  get status(): SyncStatus {
    const sources = this.db.readSettings().sources;
    return {
      running: sources.some(({ id }) => this.scans.has(id)),
      error:
        sources
          .map(({ id }) => this.failures.get(id))
          .filter(Boolean)
          .join(' ') || null,
    };
  }

  async updateCode(key: string, previous: string, code: string) {
    const { peerId, messageId } = telegramLocation(key);
    await this.queue.add(async () => {
      if (!this.enabled(peerId)) return;
      const file = await this.port.read(peerId, messageId);
      if (!file || !this.enabled(peerId) || file.editable === false) return;
      const caption = captionWithCode(file.caption, code, previous);
      if (caption !== file.caption)
        await this.port.edit(peerId, messageId, caption);
    });
  }

  start() {
    this.unsubscribe = this.port.subscribe(({ peerId, id }) => {
      if (this.closed || !this.enabled(peerId)) return;
      void this.queue
        .add(async () => {
          if (this.closed || !this.enabled(peerId)) return;
          const file = await this.port.read(peerId, id);
          if (file) await this.import(file);
        })
        .catch((error: unknown) => {
          console.error(
            'telegram import failed',
            error instanceof Error ? error.message : 'unknown',
          );
        });
    });
    this.resync();
  }

  resync(sourceIds = this.db.readSettings().sources.map(({ id }) => id)) {
    for (const peerId of sourceIds) {
      if (this.closed || this.scans.has(peerId)) continue;
      this.scans.add(peerId);
      this.failures.delete(peerId);
      void this.queue.add(async () => {
        try {
          await this.reconcile(peerId);
        } catch (error) {
          const title = this.db
            .readSettings()
            .sources.find(({ id }) => id === peerId)?.title;
          if (title)
            this.failures.set(peerId, `Couldn’t re-sync ${title}. Try again.`);
          console.error(
            'telegram history sync failed',
            peerId,
            error instanceof Error ? error.message : 'unknown',
          );
        } finally {
          this.scans.delete(peerId);
        }
      });
    }
    return this.status;
  }

  private async reconcile(peerId: number) {
    if (this.closed || !this.enabled(peerId)) return;
    const missing = new Map(
      this.db
        .storedInSource(peerId)
        .flatMap(({ id, key }) => (key ? [[key, { id, key }]] : [])),
    );
    for await (const file of this.port.history(peerId)) {
      if (this.closed || !this.enabled(peerId)) return;
      const key = telegramKey(peerId, file.id);
      const previous = missing.get(key);
      missing.delete(key);
      // a dashboard deletion may have finished since this history page was fetched.
      if (!previous || this.db.get(previous.id)) await this.import(file);
    }
    if (!this.closed && this.enabled(peerId))
      this.db.pruneMissing([...missing.values()]);
  }

  async import(file: SavedDocument) {
    if (this.closed || !this.enabled(file.peerId)) return;
    const key = telegramKey(file.peerId, file.id);
    let record = this.db.byStorageKey(key);
    if (record?.status === 'deleting') return;
    if (
      !record?.width &&
      !file.width &&
      mediaKind(file) === 'image' &&
      this.port.dimensions
    ) {
      try {
        const dimensions = await this.port.dimensions(file.peerId, file.id);
        if (dimensions) file = { ...file, ...dimensions };
      } catch (error) {
        console.warn(
          'telegram image dimensions unavailable',
          error instanceof Error ? error.name : 'unknown',
        );
      }
      if (this.closed || !this.enabled(file.peerId)) return;
      const current = this.db.byStorageKey(key);
      if (record && !current) return;
      record = current;
    }
    if (!record) {
      const marker = /^tg-drop · ([a-f0-9-]{36})(?:\n|$)/.exec(
        file.caption.text,
      )?.[1];
      const owned = marker ? this.db.get(marker) : undefined;
      if (owned?.sourceId === file.peerId && !owned.storageKey) {
        if (owned.status === 'deleting') return;
        this.db.update(owned.id, { storageKey: key });
        record = this.db.get(owned.id);
      } else {
        const candidate = {
          id: randomUUID(),
          name: file.name,
          size: file.size,
          mime: file.mime,
          width: file.width ?? null,
          height: file.height ?? null,
          code: generateCode(),
          createdAt: file.createdAt,
          status: 'ready' as const,
          storageKey: key,
          sourceId: file.peerId,
        };
        this.db.insert(candidate);
        record = candidate;
      }
    }
    if (
      record &&
      file.width &&
      file.height &&
      !record.width &&
      !record.height
    ) {
      this.db.update(record.id, { width: file.width, height: file.height });
    }
    if (!record || record.status === 'deleting' || file.editable === false)
      return;
    const caption = captionWithCode(file.caption, record.code);
    if (caption !== file.caption) {
      try {
        await this.port.edit(file.peerId, file.id, caption);
      } catch (error) {
        console.warn(
          'telegram caption sync failed',
          error instanceof Error ? error.message : 'unknown',
        );
      }
    }
  }

  async stop() {
    this.closed = true;
    this.unsubscribe?.();
    await this.queue.onIdle();
  }
}
