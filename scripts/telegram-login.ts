import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import QRCode from 'qrcode';
import { telegramClient } from '../server/storage/telegram.js';
import { question } from './terminal.js';

const { values } = parseArgs({ options: { 'qr-image': { type: 'boolean' } } });

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('telegram login requires an interactive terminal');
  process.exit(1);
}

const directory = resolve(process.env.DATA_DIR ?? './data');
await mkdir(directory, { recursive: true, mode: 0o700 });
const client = telegramClient({
  TG_API_ID: Number(process.env.TG_API_ID),
  TG_API_HASH: process.env.TG_API_HASH,
  DATA_DIR: directory,
});

const imageDirectory = values['qr-image']
  ? await mkdtemp(join(tmpdir(), 'tg-drop-qr-'))
  : undefined;
const abort = new AbortController();
let qrWrite = Promise.resolve();

const user = await client
  .start({
    abortSignal: abort.signal,
    qrCodeHandler: (url, expires) => {
      if (imageDirectory) {
        const image = join(imageDirectory, 'telegram-qr.png');
        const pending = `${image}.tmp`;
        qrWrite = qrWrite
          .then(async () => {
            const png = await QRCode.toBuffer(url, { width: 400 });
            await writeFile(pending, png, { mode: 0o600 });
            await rename(pending, image);
            console.log(
              `telegram login qr: ${image} (expires ${expires.toISOString()})`,
            );
          })
          .catch((error: unknown) => abort.abort(error));
        return;
      }

      QRCode.toString(url, { type: 'terminal', small: true }, (error, qr) => {
        if (error) throw error;
        console.clear();
        console.log(qr);
        console.log('telegram → settings → devices → link desktop device');
      });
    },
    password: () => question('telegram 2fa password: ', true),
    invalidCodeCallback: () => console.log('invalid password, try again'),
  })
  .finally(async () => {
    try {
      await client.destroy();
    } finally {
      await qrWrite;
      if (imageDirectory)
        await rm(imageDirectory, { recursive: true, force: true });
    }
  });

console.log(`telegram connected as ${user.displayName}`);
console.log(`session saved to ${resolve(directory, 'telegram.session')}`);
