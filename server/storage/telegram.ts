import { RawDocument, TelegramClient } from '@mtcute/node';
import { captionWithCode } from '../telegram-sync.js';
import { join } from 'node:path';
import type { Config } from '../config.js';
import type { FileRecord } from '../database.js';
import type { FileStorage } from './types.js';

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
  constructor(private client: TelegramClient) {}

  async put(
    path: string,
    file: FileRecord,
    progress: (percent: number) => void,
  ) {
    const marker = `tg-drop · ${file.id}`;
    const caption = captionWithCode({ text: marker }, file.code);
    const existing = await this.client.searchMessages({
      chatId: 'self',
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
          chatId: 'self',
          message: stored.id,
          text: annotated,
        });
      return String(stored.id);
    }
    const message = await this.client.sendMedia(
      'self',
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
    return String(message.id);
  }

  async open(key: string) {
    // resolve the message each time so telegram file references stay fresh.
    const [message] = await this.client.getMessages('self', Number(key));
    if (!message?.media || !(message.media instanceof RawDocument))
      throw new Error('stored file is unavailable');
    return this.client.downloadAsNodeStream(message.media);
  }

  async remove(key: string) {
    const messages = (
      await this.client.getMessages('self', Number(key))
    ).filter((message) => message !== null);
    if (messages.length)
      await this.client.deleteMessages(messages, { revoke: true });
  }

  async close() {
    await this.client.destroy();
  }
}
