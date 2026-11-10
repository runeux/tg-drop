import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { hashPassword } from '../server/security.js';
import { question } from './terminal.js';

const password = z
  .string()
  .trim()
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
      .trim()
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
