import { Photo, RawDocument, TelegramClient } from '@mtcute/node';
import { captionWithCode } from '../telegram-sync.js';
import { telegramKey, telegramLocation } from '../telegram-chat.js';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { Config } from '../config.js';
import type { FileRecord } from '../database.js';
import type { ByteRange, FileStorage } from './types.js';

export function telegramClient(
  config: Pick<Config, 'TG_API_ID' | 'TG_API_HASH' | 'DATA_DIR'>,
) {
  if (!config.TG_API_ID || !config.TG_API_HASH)
    throw new Error('telegram credentials missing');
  return new TelegramClient({
    apiId: config.TG_API_ID,
    apiHash: config.TG_API_HASH,
    storage: join(config.DATA_DIR, 'telegram.session'),
    initConnectionOptions: {
      deviceModel: 'tg-drop',
      appVersion: '1.0.0',
      systemVersion: `${process.platform} / node ${process.versions.node}`,
    },
  });
}

export class TelegramStorage implements FileStorage {
  constructor(
    private client: Pick<
      TelegramClient,
      | 'searchMessages'
      | 'editMessage'
      | 'sendMedia'
      | 'getMessages'
      | 'downloadAsNodeStream'
      | 'deleteMessages'
      | 'destroy'
    >,
  ) {}

  async put(
    path: string,
    file: FileRecord,
    progress: (percent: number) => void,
  ) {
    const peerId = file.sourceId;
    if (!peerId) throw new Error('Choose a Telegram source for uploads.');
    const marker = `tg-drop · ${file.id}`;
    const caption = captionWithCode({ text: marker }, file.code);
    const existing = await this.client.searchMessages({
      chatId: peerId,
      query: file.id,
      limit: 1,
    });
    const stored = existing.find(
      (message) =>
        message.text.startsWith(marker) && message.media?.type === 'document',
    );
    if (stored) {
      const original = stored.textWithEntities;
      const annotated = captionWithCode(original, file.code);
      if (annotated !== original)
        await this.client.editMessage({
          chatId: peerId,
          message: stored.id,
          text: annotated,
        });
      return telegramKey(peerId, stored.id);
    }
    const message = await this.client.sendMedia(
      peerId,
      {
        type: 'document',
        file: `file:${path}`,
        fileName: file.name,
        fileSize: file.size,
        fileMime: file.mime,
      },
      {
        caption,
        progressCallback: (uploaded, total) =>
          progress(total ? Math.round((uploaded / total) * 100) : 0),
      },
    );
    return telegramKey(peerId, message.id);
  }

  async open(key: string, range?: ByteRange) {
    // resolve the message each time so telegram file references stay fresh.
    const { peerId, messageId } = telegramLocation(key);
    const [message] = await this.client.getMessages(peerId, messageId);
    if (!(
      message?.media instanceof RawDocument || message?.media instanceof Photo
    ))
      throw new Error('stored file is unavailable');
    if (!range) return this.client.downloadAsNodeStream(message.media);
    // telegram offsets must align to 4 kib; trim the leading bytes locally.
    const offset = Math.floor(range.start / 4096) * 4096;
    const source = this.client.downloadAsNodeStream(message.media, { offset });
    const output = Readable.from(
      (async function* () {
        let skip = range.start - offset;
        let remaining = range.end - range.start + 1;
        try {
          for await (const chunk of source) {
            if (!(chunk instanceof Uint8Array))
              throw new Error('invalid file chunk');
            const ignored = Math.min(skip, chunk.length);
            skip -= ignored;
            const data = chunk.subarray(ignored, ignored + remaining);
            if (data.length) {
              remaining -= data.length;
              yield data;
            }
            if (!remaining) break;
          }
        } finally {
          source.destroy();
        }
      })(),
    );
    output.once('close', () => source.destroy());
    return output;
  }

  async remove(key: string) {
    const { peerId, messageId } = telegramLocation(key);
    const messages = (await this.client.getMessages(peerId, messageId)).filter(
      (message) => message !== null,
    );
    if (messages.length)
      await this.client.deleteMessages(messages, { revoke: true });
  }

  async close() {
    await this.client.destroy();
  }
}
