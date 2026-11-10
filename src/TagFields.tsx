import { useId } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { tagColors, type Tag } from '../shared/settings';

const colors = Object.keys(tagColors).filter(isColor);

function isColor(value: string): value is Tag['color'] {
  return Object.hasOwn(tagColors, value);
}

function TagColor({
  tag,
  change,
}: {
  tag: Tag;
  change: (color: Tag['color']) => void;
}) {
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="tag-color-button"
        aria-label={`Color for ${tag.label || 'new tag'}`}
        popoverTarget={id}
      >
        <span style={{ background: tagColors[tag.color] }} />
      </button>
      <div
        id={id}
        popover="auto"
        className="tag-palette"
        role="group"
        aria-label="Tag colors"
      >
        {colors.map((name) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={tag.color === name}
            style={{ background: tagColors[name] }}
            onClick={(event) => {
              change(name);
              event.currentTarget.parentElement?.hidePopover();
            }}
          >
            {tag.color === name && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </>
  );
}

export function TagFields({
  tags,
  change,
  remove,
  busy,
}: {
  tags: Tag[];
  change: (tags: Tag[]) => void;
  remove: (id: string) => void;
  busy: boolean;
}) {
  const update = (id: string, values: Partial<Pick<Tag, 'label' | 'color'>>) =>
    change(tags.map((tag) => (tag.id === id ? { ...tag, ...values } : tag)));
  return (
    <fieldset className="tag-fields" disabled={busy}>
      {tags.map((tag, index) => (
        <div className="tag-field" key={tag.id}>
          <TagColor tag={tag} change={(color) => update(tag.id, { color })} />
          <input
            aria-label={`Tag label ${index + 1}`}
            placeholder="tag name"
            maxLength={32}
            value={tag.label}
            onChange={(event) => update(tag.id, { label: event.target.value })}
          />
          <button
            type="button"
            className="row-action"
            aria-label={`Remove tag ${tag.label || index + 1}`}
            onClick={() => remove(tag.id)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="settings-quiet"
        onClick={() =>
          change([
            ...tags,
            {
              id: crypto.randomUUID(),
              label: '',
              color: colors[tags.length % colors.length] ?? 'rose',
            },
          ])
        }
      >
        <Plus size={15} aria-hidden="true" /> add a tag
      </button>
    </fieldset>
  );
}
