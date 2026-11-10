import type { ChatOption, SaveSettings } from '../shared/settings.js';
import type { Files } from './files.js';
import { HttpError } from './errors.js';
import type { TelegramSync } from './telegram-sync.js';

export interface TelegramSources {
  chats: () => Promise<ChatOption[]>;
  sync: Pick<TelegramSync, 'status' | 'resync' | 'updateCode'>;
}

export async function saveSourceSettings(
  files: Files,
  telegram: TelegramSources,
  { sources, tags }: SaveSettings,
) {
  if (!sources.length)
    throw new HttpError(400, 'Add at least one Telegram source.');
  if (new Set(sources.map(({ id }) => id)).size !== sources.length)
    throw new HttpError(400, 'Each source must be a different chat.');
  const tagIds = new Set(tags.map(({ id }) => id));
  if (
    tagIds.size !== tags.length ||
    sources.some(({ tagId }) => tagId && !tagIds.has(tagId))
  )
    throw new HttpError(400, 'Choose a tag from the tags list.');

  const known = new Map(
    (await telegram.chats()).map(({ id, title }) => [id, title]),
  );
  const previous = new Map(
    files.db.readSettings().sources.map(({ id, title }) => [id, title]),
  );
  const settings = {
    tags,
    sources: sources.map((source) => {
      const title = known.get(source.id) ?? previous.get(source.id);
      if (title === undefined)
        throw new HttpError(
          400,
          'Choose a Telegram chat where you can post files.',
        );
      return { ...source, title };
    }),
  };
  const selected = new Set(sources.map(({ id }) => id));
  const removed = new Set(
    [...previous.keys()].filter((id) => !selected.has(id)),
  );
  if (removed.size && files.hasPendingUploads(removed))
    throw new HttpError(
      409,
      'Finish or cancel uploads before removing their source.',
    );
  files.db.saveSettings(settings);
  files.resumeUploads();
  const added = sources
    .filter(({ id }) => !previous.has(id))
    .map(({ id }) => id);
  if (added.length) telegram.sync.resync(added);
}
