import { Plus, X } from 'lucide-react';
import type { ChatOption, Tag } from '../shared/settings';

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
          <select
            aria-label={`Telegram source ${index + 1}`}
            disabled={busy}
            value={id ?? ''}
            onChange={(event) =>
              update(key, { id: Number(event.target.value) || null })
            }
          >
            <option value="">choose a chat</option>
            {chats
              .filter((chat) => chat.id === id || !selected.has(chat.id))
              .map((chat) => (
                <option key={chat.id} value={chat.id}>
                  {chat.title}
                </option>
              ))}
          </select>
          {tags.length > 0 && (
            <select
              aria-label={`Tag for source ${index + 1}`}
              disabled={busy}
              value={tagId ?? ''}
              onChange={(event) =>
                update(key, { tagId: event.target.value || null })
              }
            >
              <option value="">no tag</option>
              {tags
                .filter((tag) => tag.label.trim())
                .map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.label}
                  </option>
                ))}
            </select>
          )}
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
