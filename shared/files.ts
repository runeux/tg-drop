import { z } from 'zod';

export const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  mime: z.string(),
  code: z.string(),
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

export const resolveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('upload') }),
  downloadSchema.extend({ kind: z.literal('download') }),
]);

export function formatSize(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  const unit = Math.min(Math.floor(Math.log10(bytes) / 3), 3);
  return `${Number((bytes / 1000 ** unit).toFixed(unit > 1 ? 1 : 0))} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}
