import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function LibrarySearch({
  changeQuery,
  types,
  excluded,
  toggleType,
  selectAll,
}: {
  changeQuery: (query: string) => void;
  types: [extension: string, count: number][];
  excluded: ReadonlySet<string>;
  toggleType: (extension: string) => void;
  selectAll: () => void;
}) {
  const [value, setValue] = useState('');
  const allSelected = types.every(([extension]) => !excluded.has(extension));

  useEffect(() => {
    const timer = setTimeout(
      () => changeQuery(value.trim().toLowerCase()),
      150,
    );
    return () => clearTimeout(timer);
  }, [value, changeQuery]);

  return (
    <div className="library-search">
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        aria-label="Search files"
        placeholder="search"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger type="button" className="library-type-trigger">
          any type
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="library-type-menu">
          <DropdownMenuCheckboxItem
            className="library-type-all"
            checked={allSelected}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={selectAll}
          >
            all
          </DropdownMenuCheckboxItem>
          {types.map(([extension, count]) => (
            <DropdownMenuCheckboxItem
              key={extension}
              checked={!excluded.has(extension)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => toggleType(extension)}
            >
              <span className="library-type-name">
                {extension || 'no extension'}
              </span>
              <span className="library-type-count">{count}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
