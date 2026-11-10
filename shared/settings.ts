import { z } from 'zod';

export const tagColors = {
  rose: '#fda4af',
  pink: '#f9a8d4',
  purple: '#d8b4fe',
  violet: '#c4b5fd',
  indigo: '#a5b4fc',
  blue: '#93c5fd',
  sky: '#7dd3fc',
  teal: '#5eead4',
  green: '#86efac',
  lime: '#bef264',
  amber: '#fcd34d',
  orange: '#fdba74',
};

export const tagSchema = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(32),
  color: z.custom<keyof typeof tagColors>(
    (value) => typeof value === 'string' && Object.hasOwn(tagColors, value),
  ),
});

const sourceSelectionSchema = z.object({
  id: z
    .number()
    .int()
    .refine((id) => id !== 0),
  tagId: z.uuid().nullable(),
});

export const chatOptionSchema = z.object({
  id: sourceSelectionSchema.shape.id,
  title: z.string(),
});

export const sourceSchema = sourceSelectionSchema.extend({
  title: chatOptionSchema.shape.title,
});

export const settingsSchema = z.object({
  sources: z.array(sourceSchema),
  tags: z.array(tagSchema),
});

export const saveSettingsSchema = z.object({
  sources: z.array(sourceSelectionSchema),
  tags: settingsSchema.shape.tags,
});

export const syncStatusSchema = z.object({
  running: z.boolean(),
  error: z.string().nullable(),
});

export const workspaceSettingsSchema = settingsSchema.extend({
  telegram: z.boolean(),
  sync: syncStatusSchema,
});

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type SaveSettings = z.infer<typeof saveSettingsSchema>;
export type ChatOption = z.infer<typeof chatOptionSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type SyncStatus = z.infer<typeof syncStatusSchema>;
