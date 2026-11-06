import { serve } from '@hono/node-server';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Server } from 'node:http';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { Files } from './files.js';
import { LocalStorage } from './storage/local.js';
import { telegramClient, TelegramStorage } from './storage/telegram.js';
import { TelegramSync, telegramSyncPort } from './telegram-sync.js';

const config = readConfig();
await mkdir(config.DATA_DIR, { recursive: true, mode: 0o700 });
const client = config.STORAGE === 'telegram' ? telegramClient(config) : null;
if (client) await client.start({});
const storage = client
  ? new TelegramStorage(client)
  : new LocalStorage(join(config.DATA_DIR, 'objects'));
const files = new Files(config, storage);
await files.start();
const sync = client
  ? new TelegramSync(telegramSyncPort(client), files.db)
  : null;
sync?.start();
const app = createApp(config, files);
const server = serve(
  { fetch: app.fetch, hostname: config.HOST, port: config.PORT },
  ({ port }) => console.log(`drop listening on ${config.HOST}:${port}`),
);
if (server instanceof Server) server.requestTimeout = 0;

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  server.close(() => {
    void (async () => {
      await sync?.stop();
      await files.close();
      process.exit(0);
    })();
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
