import { Plus, X } from 'lucide-react';
import type { ChatOption, Tag } from '../shared/settings';
import { SourcePicker } from './SourcePicker';
import { TagBadge } from './TagBadge';

export type SourceDraft = {
  key: string;
  id: number | null;
  tagId: string | null;
};

export function SourceFields({
  sources,
  chats,
  tags,
  change,
  busy,
}: {
  sources: SourceDraft[];
  chats: ChatOption[];
  tags: Tag[];
  change: (sources: SourceDraft[]) => void;
  busy: boolean;
}) {
  const tagOptions = [
    { value: '', label: 'no tag' },
    ...tags
      .filter(({ label }) => label.trim())
      .map((tag) => ({
        value: tag.id,
        label: tag.label,
        badge: <TagBadge tag={tag} />,
      })),
  ];
  const selected = new Set(sources.map(({ id }) => id));
  const update = (
    key: string,
    changes: Partial<Pick<SourceDraft, 'id' | 'tagId'>>,
  ) =>
    change(
      sources.map((source) =>
        source.key === key ? { ...source, ...changes } : source,
      ),
    );

  return (
    <div className="source-fields">
      {sources.map(({ key, id, tagId }, index) => (
        <div className="source-field" key={key}>
          <SourcePicker
            label={`Telegram source ${index + 1}`}
            placeholder="choose a chat"
            disabled={busy}
            value={id === null ? '' : String(id)}
            options={chats
              .filter((chat) => chat.id === id || !selected.has(chat.id))
              .map(({ id, title }) => ({ value: String(id), label: title }))}
            change={(value) => update(key, { id: Number(value) })}
          />
          {tagOptions.length > 1 && (
            <SourcePicker
              label={`Tag for source ${index + 1}`}
              placeholder="no tag"
              className="source-picker-tag"
              disabled={busy}
              value={tagId ?? ''}
              options={tagOptions}
              change={(value) => update(key, { tagId: value || null })}
            />
          )}
          {sources.length > 1 && (
            <button
              type="button"
              className="row-action"
              aria-label={`Remove source ${index + 1}`}
              disabled={busy}
              onClick={() =>
                change(sources.filter((source) => source.key !== key))
              }
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="settings-quiet"
        disabled={busy || !chats.some((chat) => !selected.has(chat.id))}
        onClick={() =>
          change([
            ...sources,
            { key: crypto.randomUUID(), id: null, tagId: null },
          ])
        }
      >
        <Plus size={15} aria-hidden="true" />
        {sources.length ? 'add another source' : 'add a source'}
      </button>
    </div>
  );
}
