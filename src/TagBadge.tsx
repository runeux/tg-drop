import { tagColors, type Tag } from '../shared/settings';

export function TagBadge({ tag }: { tag: Tag }) {
  const color = tagColors[tag.color];
  return (
    <span
      className="tag-badge"
      title={tag.label}
      style={{ color, backgroundColor: `${color}25` }}
    >
      {tag.label}
    </span>
  );
}
