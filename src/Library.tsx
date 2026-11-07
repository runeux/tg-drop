import { lazy, Suspense, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { LoaderCircle } from 'lucide-react';
import { mediaKind } from '../shared/media';
import type { DropFile } from '../shared/files';
import { SavedFile, type SavedFileProps } from './FileRow';
import { CodeEditor } from './CodeEditor';
import './library.css';

const Gallery = lazy(() => import('./Gallery'));

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
  const [tab, setTab] = useState<'files' | 'gallery'>('files');
  const [editing, setEditing] = useState<DropFile | null>(null);
  const reducedMotion = useReducedMotion();
  const gallery = entries.filter(({ file }) => mediaKind(file));
  const documents = entries.filter(({ file }) => !mediaKind(file));
  const current = tab === 'files' ? documents : gallery;
  const rows = current.filter(
    ({ file }) => tab === 'files' || file.status !== 'ready',
  );

  return (
    <div className="library" data-tab={tab}>
      <div className="dashboard-tabs" role="tablist" aria-label="Library">
        {(['files', 'gallery'] as const).map((name) => (
          <button
            key={name}
            id={`tab-${name}`}
            role="tab"
            aria-selected={tab === name}
            aria-controls={`panel-${name}`}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 'files'
                  : event.key === 'End'
                    ? 'gallery'
                    : name === 'files'
                      ? 'gallery'
                      : 'files';
              setTab(next);
              document.getElementById(`tab-${next}`)?.focus();
            }}
          >
            {tab === name && (
              <motion.span
                className="tab-indicator"
                layoutId="dashboard-tab"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', bounce: 0, duration: 0.3 }
                }
              />
            )}
            <span>{name}</span>
            <small>
              {name === 'files' ? documents.length : gallery.length}
            </small>
          </button>
        ))}
      </div>
      <div
        key={tab}
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        aria-busy={!loaded}
        tabIndex={0}
      >
        {tab === 'gallery' && (
          <Suspense
            fallback={
              <div className="list-loading">
                <LoaderCircle size={18} className="spinning" />
              </div>
            }
          >
            <Gallery
              files={gallery
                .filter(({ file }) => file.status === 'ready')
                .map(({ file }) => file)}
              remove={remove}
              editCode={setEditing}
            />
          </Suspense>
        )}
        <ul
          className="file-list"
          aria-label={tab === 'files' ? 'Files' : 'Media uploads'}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((entry) => (
              <SavedFile key={entry.file.id} {...entry} editCode={setEditing} />
            ))}
          </AnimatePresence>
        </ul>
        {loaded && !current.length && (
          <p className="library-empty">
            {tab === 'gallery'
              ? 'your images and videos will appear here'
              : 'your files will appear here'}
          </p>
        )}
      </div>
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
