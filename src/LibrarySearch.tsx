import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import {
  ActiveFilters,
  LibraryFilters,
  type FilterGroup,
} from './LibraryFilters';

export function LibrarySearch({
  changeQuery,
  groups,
}: {
  changeQuery: (query: string) => void;
  groups: FilterGroup[];
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const timer = setTimeout(
      () => changeQuery(value.trim().toLowerCase()),
      150,
    );
    return () => clearTimeout(timer);
  }, [value, changeQuery]);

  return (
    <div className="library-controls">
      <div className="library-search-bar">
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
        </div>
        <LibraryFilters groups={groups} />
      </div>
      <ActiveFilters groups={groups} />
    </div>
  );
}
