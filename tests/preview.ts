import { serve } from '@hono/node-server';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/security.js';
import { Files } from '../server/files.js';
import { LocalStorage } from '../server/storage/local.js';

const directory = await mkdtemp(join(tmpdir(), 'tg-drop-preview-'));
const config = readConfig({
  DATA_DIR: directory,
  STORAGE: 'local',
  MAX_FILE_BYTES: '2000000000',
  ORIGIN: 'http://127.0.0.1:4173',
  PASSWORD_HASH: hashPassword('test-password'),
  SESSION_SECRET: 'a'.repeat(64),
});
const files = new Files(config, new LocalStorage(join(directory, 'objects')));
await files.start();
const server = serve({
  fetch: createApp(config, files).fetch,
  port: 4173,
  hostname: '127.0.0.1',
});
console.log('preview: http://127.0.0.1:4173');
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.close(() => {
    void files
      .close()
      .then(() => rm(directory, { recursive: true, force: true }))
      .then(() => process.exit(0));
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
