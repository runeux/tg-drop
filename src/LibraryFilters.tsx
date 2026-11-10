import { SlidersHorizontal, X } from 'lucide-react';
import type { Tag } from '../shared/settings';
import { TagBadge } from './TagBadge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

export type FilterGroup = {
  label: string;
  options: { id: string; label: string; tag?: Tag }[];
  selected: ReadonlySet<string> | null;
  includesUnlisted?: boolean;
  change: (selection: ReadonlySet<string> | null) => void;
};

function FilterSection({ group }: { group: FilterGroup }) {
  const { label, options, selected, change } = group;

  function toggle(id: string) {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    change(
      next.size === 0 ||
        (!group.includesUnlisted && next.size === options.length)
        ? null
        : next,
    );
  }

  return (
    <DropdownMenuGroup aria-label={label} className="filter-section">
      <div className="filter-heading">
        <span>{label}</span>
        <DropdownMenuItem
          className="filter-text-action"
          aria-label={`select all ${label}`}
          disabled={!selected}
          closeOnClick={false}
          onClick={() => change(null)}
        >
          select all
        </DropdownMenuItem>
      </div>
      <div className="filter-options" data-default={selected === null}>
        {options.map(({ id, label, tag }) => (
          <DropdownMenuCheckboxItem
            key={id}
            className={tag ? 'filter-chip filter-chip-colored' : 'filter-chip'}
            checked={selected === null || selected.has(id)}
            closeOnClick={false}
            onCheckedChange={() => toggle(id)}
          >
            {tag ? <TagBadge tag={tag} /> : label}
          </DropdownMenuCheckboxItem>
        ))}
        {!options.length && (
          <span className="filter-empty">no {label} yet</span>
        )}
      </div>
    </DropdownMenuGroup>
  );
}

export function LibraryFilters({ groups }: { groups: FilterGroup[] }) {
  const active = groups.some(({ selected }) => selected !== null);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        type="button"
        className="row-action filter-trigger"
        data-active={active}
        aria-label="Filters"
        title="Filters"
      >
        <SlidersHorizontal size={17} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="filter-menu">
        <DropdownMenuGroup className="filter-heading filter-menu-heading">
          <span>filters</span>
          <DropdownMenuItem
            className="filter-text-action"
            disabled={!active}
            closeOnClick={false}
            onClick={() => {
              for (const group of groups) group.change(null);
            }}
          >
            clear filters
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {groups.map((group) => (
          <FilterSection key={group.label} group={group} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ActiveFilters({ groups }: { groups: FilterGroup[] }) {
  const active = groups.filter(({ selected }) => selected !== null);
  if (!active.length) return null;
  return (
    <div className="active-filters" aria-label="Active filters">
      {active.map(({ label, options, selected, change }) => {
        const names = options
          .filter(({ id }) => selected?.has(id))
          .map((option) => option.label);
        const extra = names.length - 2;
        const summary = [
          ...names.slice(0, 2),
          ...(extra > 0 ? [`+${extra}`] : []),
        ].join(', ');
        return (
          <Badge
            variant="secondary"
            render={<button type="button" />}
            key={label}
            className="active-filter"
            aria-label={`Clear ${label} filter`}
            onClick={() => change(null)}
          >
            <span title={names.join(', ')}>{summary}</span>
            <X size={12} aria-hidden="true" />
          </Badge>
        );
      })}
    </div>
  );
}
