import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { DropFile } from '../shared/files';
import { SavedFile, type PreviewSource, type SavedFileProps } from './FileRow';
import { CodeEditor } from './CodeEditor';
import { FilePeek } from './FilePeek';
import { LibrarySearch } from './LibrarySearch';
import type { Tag } from '../shared/settings';
import type { FilterGroup } from './LibraryFilters';
import { extensionOf } from './file-extension';
import './library.css';

export function Library({
  entries,
  loaded,
  remove,
  changeCode,
}: {
  entries: SavedFileProps[];
  loaded: boolean;
  remove: (id: string) => Promise<void>;
  changeCode: (id: string, code: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<DropFile | null>(null);
  const [selection, setSelection] = useState<{
    id: string;
    source: PreviewSource;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [selectedTypes, setSelectedTypes] =
    useState<ReadonlySet<string> | null>(null);
  const [selectedTags, setSelectedTags] = useState<ReadonlySet<string> | null>(
    null,
  );

  const preview = entries.find(({ file }) => file.id === selection?.id)?.file;
  const types = new Set<string>();
  const tags = new Map<string, Tag>();
  for (const { file } of entries) {
    types.add(extensionOf(file.name));
    if (file.tag) tags.set(file.tag.id, file.tag);
  }
  const groups: FilterGroup[] = [
    {
      label: 'tags',
      includesUnlisted: entries.some(({ file }) => !file.tag),
      options: [...tags.values()]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((tag) => ({ id: tag.id, label: tag.label, tag })),
      selected: selectedTags,
      change: setSelectedTags,
    },
    {
      label: 'file types',
      options: [...types]
        .sort((a, b) => a.localeCompare(b))
        .map((extension) => ({
          id: extension,
          label: extension || 'no extension',
        })),
      selected: selectedTypes,
      change: setSelectedTypes,
    },
  ];
  for (const group of groups) {
    if (!group.selected) continue;
    const selection = group.selected;
    const available = group.options.filter(({ id }) => selection.has(id));
    if (!group.includesUnlisted && available.length === group.options.length)
      group.selected = null;
    else if (available.length !== selection.size) {
      group.selected = available.length
        ? new Set(available.map(({ id }) => id))
        : null;
    }
  }
  const [tagFilter, typeFilter] = groups;
  const filtered = entries.filter(
    ({ file }) =>
      (!tagFilter?.selected ||
        (file.tag && tagFilter.selected.has(file.tag.id))) &&
      (!typeFilter?.selected ||
        typeFilter.selected.has(extensionOf(file.name))) &&
      (file.name.toLowerCase().includes(query) ||
        file.code.toLowerCase().includes(query)),
  );

  const codeEditor = editing && (
    <CodeEditor
      file={editing}
      close={() => setEditing(null)}
      save={(code) => changeCode(editing.id, code)}
    />
  );

  return (
    <div className="library">
      <LibrarySearch changeQuery={setQuery} groups={groups} />
      <ul className="file-list" aria-label="Files" aria-busy={!loaded}>
        <AnimatePresence initial={false} mode="popLayout">
          {filtered.map((entry) => (
            <SavedFile
              key={entry.file.id}
              {...entry}
              editCode={setEditing}
              openPreview={(id, source) => setSelection({ id, source })}
            />
          ))}
        </AnimatePresence>
      </ul>
      {loaded && !filtered.length && (
        <p className="library-empty">
          {entries.length ? 'no matching files' : 'your files will appear here'}
        </p>
      )}
      {preview && selection && (
        <FilePeek
          key={preview.id}
          file={preview}
          source={selection.source}
          close={() => setSelection(null)}
          remove={() => remove(preview.id)}
          editCode={setEditing}
        >
          {codeEditor}
        </FilePeek>
      )}
      {!preview && codeEditor}
    </div>
  );
}
