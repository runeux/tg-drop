import { z } from 'zod';
import { syncStatusSchema, tagSchema } from './settings.js';

export const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  mime: z.string(),
  width: z.number().positive().nullable().optional(),
  height: z.number().positive().nullable().optional(),
  code: z.string(),
  createdAt: z.number(),
  status: z.enum(['queued', 'storing', 'ready', 'failed']),
  progress: z.number(),
  tag: tagSchema.optional(),
});

export type DropFile = z.infer<typeof fileSchema>;
export const filesResponseSchema = z.object({
  files: z.array(fileSchema),
  sync: syncStatusSchema.optional(),
});
export const downloadSchema = z.object({
  name: z.string(),
  size: z.number(),
  url: z.string(),
});

export function formatSize(bytes: number) {
  if (bytes < 1000) return `${bytes}\u00a0B`;
  const unit = Math.min(Math.floor(Math.log10(bytes) / 3), 3);
  return `${Number((bytes / 1000 ** unit).toFixed(unit > 1 ? 1 : 0))}\u00a0${['B', 'KB', 'MB', 'GB'][unit]}`;
}
