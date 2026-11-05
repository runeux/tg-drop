import { z } from 'zod';

export const expirationSchema = z.enum(['download', '3days', 'month', 'never']);
export type Expiration = z.infer<typeof expirationSchema>;

export const expirationOptions: { value: Expiration; label: string }[] = [
  { value: 'download', label: 'until download' },
  { value: '3days', label: '3 days' },
  { value: 'month', label: '1 month' },
  { value: 'never', label: 'never' },
];

export const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  mime: z.string(),
  code: z.string(),
  expiration: expirationSchema,
  expiresAt: z.number().nullable(),
  createdAt: z.number(),
  status: z.enum(['queued', 'storing', 'ready', 'failed']),
  progress: z.number(),
});

export type DropFile = z.infer<typeof fileSchema>;
export const filesResponseSchema = z.object({ files: z.array(fileSchema) });
export const downloadSchema = z.object({
  name: z.string(),
  size: z.number(),
  url: z.string(),
});

export function formatSize(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  const unit = Math.min(Math.floor(Math.log10(bytes) / 3), 3);
  return `${Number((bytes / 1000 ** unit).toFixed(unit > 1 ? 1 : 0))} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}

export function expiresAt(expiration: Expiration, now = Date.now()) {
  if (expiration === '3days') return now + 3 * 86_400_000;
  if (expiration === 'month') {
    const date = new Date(now);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const end = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, end));
    return date.getTime();
  }
  return null;
}
