import { randomUUID } from 'node:crypto';
import {
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
import { TELEGRAM_CHAT_ID } from './telegram-chat.js';
import { imageDimensions } from './media-dimensions.js';
import { mediaKind } from '../shared/media.js';

const videoExtensions: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'image/gif': '.gif',
};

export interface SavedDocument {
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
    id: number,
  ): Promise<{ width: number; height: number } | undefined>;
  history(): AsyncIterable<SavedDocument>;
  subscribe(listener: (file: SavedDocument) => void): () => void;
  edit(id: number, caption: TextWithEntities): Promise<void>;
}

export function captionWithCode(
  caption: TextWithEntities,
  code: string,
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
      /^[2-9A-HJ-NP-Z]{4}(?:-[2-9A-HJ-NP-Z]{4}){2,3}$/.test(
        caption.text.slice(entity.offset),
      ),
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
    if (
      message.chat.id !== TELEGRAM_CHAT_ID ||
      !(message.media instanceof RawDocument || message.media instanceof Photo)
    )
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
    return {
      id: message.id,
      name,
      size,
      mime,
      ...dimensions,
      createdAt: message.date.getTime(),
      caption: message.textWithEntities,
      editable: message.forward === null,
    };
  };
  return {
    async dimensions(id) {
      const [message] = await client.getMessages(TELEGRAM_CHAT_ID, id);
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
    async *history() {
      for await (const message of client.iterHistory(TELEGRAM_CHAT_ID, {
        chunkSize: 100,
      })) {
        const file = normalize(message);
        if (file) yield file;
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
    async edit(id, text) {
      await client.editMessage({ chatId: TELEGRAM_CHAT_ID, message: id, text });
    },
  };
}

export class TelegramSync {
  private queue = new PQueue({ concurrency: 1 });
  private running = false;
  private unsubscribe?: () => void;
  private backfill?: Promise<void>;

  constructor(
    private port: TelegramSyncPort,
    private db: FileDatabase,
  ) {}

  start() {
    this.running = true;
    this.unsubscribe = this.port.subscribe((file) => {
      void this.queue
        .add(() => this.import(file))
        .catch((error: unknown) =>
          console.error(
            'telegram import failed',
            error instanceof Error ? error.message : 'unknown',
          ),
        );
    });
    this.backfill = (async () => {
      for await (const file of this.port.history()) {
        if (!this.running) break;
        await this.queue
          .add(() => this.import(file))
          .catch((error: unknown) =>
            console.error(
              'telegram caption sync failed',
              error instanceof Error ? error.message : 'unknown',
            ),
          );
      }
    })().catch((error: unknown) =>
      console.error(
        'telegram history sync failed',
        error instanceof Error ? error.message : 'unknown',
      ),
    );
  }

  async import(file: SavedDocument) {
    const key = String(file.id);
    let record = this.db.byStorageKey(key);
    if (
      !record?.width &&
      !file.width &&
      mediaKind(file) === 'image' &&
      this.port.dimensions
    ) {
      try {
        const dimensions = await this.port.dimensions(file.id);
        if (dimensions) file = { ...file, ...dimensions };
      } catch (error) {
        console.warn(
          'telegram image dimensions unavailable',
          error instanceof Error ? error.name : 'unknown',
        );
      }
    }
    if (!record) {
      const marker = /^tg-drop · ([a-f0-9-]{36})(?:\n|$)/.exec(
        file.caption.text,
      )?.[1];
      const owned = marker ? this.db.get(marker) : undefined;
      if (owned) {
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
    if (caption !== file.caption) await this.port.edit(file.id, caption);
  }

  async stop() {
    this.running = false;
    this.unsubscribe?.();
    await this.backfill;
    await this.queue.onIdle();
  }
}
