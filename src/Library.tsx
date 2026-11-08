import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { DropFile } from '../shared/files';
import { SavedFile, type PreviewSource, type SavedFileProps } from './FileRow';
import { CodeEditor } from './CodeEditor';
import { FilePeek } from './FilePeek';
import { LibrarySearch } from './LibrarySearch';
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
  const [excludedTypes, setExcludedTypes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const preview = entries.find(({ file }) => file.id === selection?.id)?.file;
  const typeCounts = new Map<string, number>();
  const filtered: SavedFileProps[] = [];
  for (const entry of entries) {
    const { file } = entry;
    const extension = extensionOf(file.name);
    typeCounts.set(extension, (typeCounts.get(extension) ?? 0) + 1);
    if (
      !excludedTypes.has(extension) &&
      (file.name.toLowerCase().includes(query) ||
        file.code.toLowerCase().includes(query))
    ) {
      filtered.push(entry);
    }
  }
  const types = [...typeCounts].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  function toggleType(extension: string) {
    setExcludedTypes((previous) => {
      const next = new Set(previous);
      if (!next.delete(extension)) next.add(extension);
      return next;
    });
  }

  return (
    <div className="library">
      <LibrarySearch
        changeQuery={setQuery}
        types={types}
        excluded={excludedTypes}
        toggleType={toggleType}
        selectAll={() => setExcludedTypes(new Set())}
      />
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
        />
      )}
      {editing && (
        <CodeEditor
          file={editing}
          close={() => setEditing(null)}
          save={(code) => changeCode(editing.id, code)}
        />
      )}
    </div>
  );
}
