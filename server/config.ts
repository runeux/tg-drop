import { resolve } from 'node:path';
import { z } from 'zod';

const schema = z.object({
  ORIGIN: z.url().default('http://127.0.0.1:5173'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  DATA_DIR: z.string().default('./data'),
  PASSWORD_HASH: z.string().min(80),
  SESSION_SECRET: z.string().min(64),
  STORAGE: z.enum(['telegram', 'local']).default('telegram'),
  TG_API_ID: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
  TG_API_HASH: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
  ),
  MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(4_000_000_000)
    .default(4_000_000_000),
  MAX_STAGING_BYTES: z.coerce.number().int().positive().default(4_500_000_000),
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.parse(env);
  if (
    parsed.STORAGE === 'telegram' &&
    (!parsed.TG_API_ID || !parsed.TG_API_HASH)
  ) {
    throw new Error('telegram api credentials are required');
  }
  return { ...parsed, DATA_DIR: resolve(parsed.DATA_DIR) };
}

export type Config = ReturnType<typeof readConfig>;
