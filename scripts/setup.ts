import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { z } from 'zod';
import { hashPassword } from '../server/security.js';

async function question(label: string, hidden = false) {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const terminal = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  process.stdout.write(label);
  muted = hidden;
  try {
    return (await terminal.question('')).trim();
  } finally {
    terminal.close();
    if (hidden) process.stdout.write('\n');
  }
}

const password = z
  .string()
  .min(8)
  .parse(await question('upload password (8+ characters): ', true));
const local = process.env.STORAGE === 'local';
const apiId = local
  ? ''
  : z.coerce
      .number()
      .int()
      .positive()
      .parse(await question('telegram api_id: '));
const apiHash = local
  ? ''
  : z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .parse(await question('telegram api_hash: ', true));
const environment = [
  'ORIGIN=http://127.0.0.1:5173',
  'DATA_DIR=./data',
  `STORAGE=${local ? 'local' : 'telegram'}`,
  `PASSWORD_HASH=${hashPassword(password)}`,
  `SESSION_SECRET=${randomBytes(48).toString('hex')}`,
  `TG_API_ID=${apiId}`,
  `TG_API_HASH=${apiHash}`,
  '',
].join('\n');
await writeFile('.env', environment, { flag: 'wx', mode: 0o600 });
console.log(
  local
    ? 'configured · npm run dev'
    : 'configured · npm run telegram:login, then npm run dev',
);
