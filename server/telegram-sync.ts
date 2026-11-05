import { randomUUID } from 'node:crypto';
import {
  RawDocument,
  type Message,
  type TelegramClient,
  type TextWithEntities,
} from '@mtcute/node';
import PQueue from 'p-queue';
import { FileDatabase } from './database.js';
import { generateCode } from './security.js';

export interface SavedDocument {
  id: number;
  name: string;
  size: number;
  mime: string;
  createdAt: number;
  caption: TextWithEntities;
  editable?: boolean;
}

export interface TelegramSyncPort {
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
  client: TelegramClient,
  selfId: number,
): TelegramSyncPort {
  const normalize = (message: Message): SavedDocument | null => {
    if (message.chat.id !== selfId || !(message.media instanceof RawDocument))
      return null;
    const media = message.media;
    const size = media.fileSize;
    if (!size || size > Number.MAX_SAFE_INTEGER) return null;
    return {
      id: message.id,
      name: media.fileName ?? `file-${message.id}`,
      size,
      mime: media.mimeType,
      createdAt: message.date.getTime(),
      caption: message.textWithEntities,
      editable: message.forward === null,
    };
  };
  return {
    async *history() {
      for await (const message of client.iterHistory('self', {
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
      await client.editMessage({ chatId: 'self', message: id, text });
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
          code: generateCode(),
          createdAt: file.createdAt,
          status: 'ready' as const,
          storageKey: key,
        };
        this.db.insert(candidate);
        record = candidate;
      }
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
