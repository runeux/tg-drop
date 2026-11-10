import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
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
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            className="tag-color-button"
          />
        }
        aria-label={`Color for ${tag.label || 'new tag'}`}
      >
        <span style={{ background: tagColors[tag.color] }} />
      </PopoverTrigger>
      <PopoverContent align="start" className="tag-palette">
        <div
          className="tag-palette-options"
          role="group"
          aria-label="Tag colors"
        >
          {colors.map((name) => (
            <PopoverPrimitive.Close
              key={name}
              render={<Button variant="ghost" size="icon-sm" />}
              aria-label={name}
              aria-pressed={tag.color === name}
              style={{ background: tagColors[name] }}
              onClick={() => change(name)}
            >
              {tag.color === name && <Check aria-hidden="true" />}
            </PopoverPrimitive.Close>
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
    <FieldSet disabled={busy}>
      <FieldGroup className="tag-fields">
        {tags.map((tag, index) => (
          <Field orientation="horizontal" className="tag-field" key={tag.id}>
            <TagColor tag={tag} change={(color) => update(tag.id, { color })} />
            <Input
              aria-label={`Tag label ${index + 1}`}
              placeholder="tag name"
              maxLength={32}
              value={tag.label}
              onChange={(event) =>
                update(tag.id, { label: event.target.value })
              }
            />
            <Button
              variant="ghost"
              type="button"
              className="row-action"
              size="icon"
              aria-label={`Remove tag ${tag.label || index + 1}`}
              onClick={() => remove(tag.id)}
            >
              <X size={16} aria-hidden="true" />
            </Button>
          </Field>
        ))}
        <Button
          variant="ghost"
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
          <Plus data-icon="inline-start" aria-hidden="true" /> add a tag
        </Button>
      </FieldGroup>
    </FieldSet>
  );
}
