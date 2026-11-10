import { Badge } from '@/components/ui/badge';
import { tagColors, type Tag } from '../shared/settings';

export function TagBadge({ tag }: { tag: Tag }) {
  const color = tagColors[tag.color];
  return (
    <Badge
      variant="secondary"
      className="tag-badge"
      title={tag.label}
      style={{ color, backgroundColor: `${color}25` }}
    >
      {tag.label}
    </Badge>
  );
}
