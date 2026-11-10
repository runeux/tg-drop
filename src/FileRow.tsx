import {
  useEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type Ref,
} from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Download,
  LoaderCircle,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { formatSize, type DropFile } from '../shared/files';
import { FileActionMenu, type FileMenuState } from './FileActionMenu';
import { FileArtwork } from './FileArtwork';
import { TagBadge } from './TagBadge';
import type { Tag } from '../shared/settings';

const generatedCode = /^(?:[2-9A-HJ-NP-Z]{4}-){3}[2-9A-HJ-NP-Z]{4}$/;

export type SavedFileProps = {
  file: DropFile;
  detail?: string;
  local?: boolean;
  remove: () => Promise<void> | void;
  retry: () => Promise<void> | void;
  ref?: Ref<HTMLLIElement>;
};

export type PreviewSource = {
  row: HTMLLIElement;
  trigger: HTMLButtonElement;
};

export function SavedFile({
  file,
  detail,
  local,
  remove,
  retry,
  editCode,
  openPreview,
  ref,
}: SavedFileProps & {
  editCode: (file: DropFile) => void;
  openPreview: (id: string, source: PreviewSource) => void;
}) {
  const [menu, setMenu] = useState<FileMenuState>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<'remove' | 'retry' | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  async function perform(action: 'remove' | 'retry') {
    if (busy) return;
    setBusy(action);
    try {
      await (action === 'remove' ? remove() : retry());
    } finally {
      setBusy(null);
      setConfirmDelete(false);
    }
  }

  function resetConfirmation() {
    clearTimeout(confirmTimer.current);
    setConfirmDelete(false);
  }

  function requestRemoval() {
    if (local || confirmDelete) {
      void perform('remove');
      return true;
    }
    setConfirmDelete(true);
    clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(resetConfirmation, 3000);
    return false;
  }

  const failure =
    file.status === 'failed'
      ? (detail ?? 'Couldn’t save. Try again.')
      : undefined;
  const status =
    file.status === 'failed'
      ? undefined
      : (detail ??
        (file.status === 'queued'
          ? 'queued'
          : file.status === 'storing'
            ? `saving · ${file.progress}%`
            : new Intl.DateTimeFormat('en', {
                month: 'short',
                day: 'numeric',
              }).format(file.createdAt)));

  const progress =
    file.status === 'storing'
      ? file.progress
      : file.status === 'queued'
        ? 0
        : undefined;
  const downloadUrl =
    file.status === 'ready' ? `/api/files/${file.id}/download` : undefined;

  return (
    <FileRow
      ref={ref}
      name={file.name}
      artwork={<FileArtwork file={file} />}
      size={file.size}
      tag={file.tag}
      detail={status}
      open={downloadUrl ? (source) => openPreview(file.id, source) : undefined}
      error={failure}
      progress={progress}
      code={
        downloadUrl && !generatedCode.test(file.code) ? file.code : undefined
      }
      onContextMenu={
        downloadUrl && !busy
          ? (event) => {
              if (
                !(event.target instanceof Node) ||
                !event.currentTarget.contains(event.target)
              )
                return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              setMenu({
                open: true,
                point:
                  event.clientX || event.clientY
                    ? { x: event.clientX, y: event.clientY }
                    : { x: rect.left, y: rect.bottom },
              });
            }
          : undefined
      }
      actions={
        downloadUrl ? (
          <>
            <motion.a
              className="row-action"
              href={downloadUrl}
              download
              aria-label={`Download ${file.name}`}
              title="Download"
              whileTap={{ scale: 0.93 }}
            >
              <Download size={16} aria-hidden="true" />
            </motion.a>
            <FileActionMenu
              name={file.name}
              code={file.code}
              busy={Boolean(busy)}
              confirmDelete={confirmDelete}
              edit={() => editCode(file)}
              remove={requestRemoval}
              resetConfirmation={resetConfirmation}
              control={{ state: menu, setState: setMenu }}
            />
          </>
        ) : (
          <>
            {file.status === 'failed' && (
              <motion.button
                className="row-action"
                whileTap={{ scale: 0.93 }}
                disabled={Boolean(busy)}
                aria-label={`Retry ${file.name}`}
                title="Retry"
                onClick={() => {
                  void perform('retry');
                }}
              >
                {busy === 'retry' ? (
                  <LoaderCircle size={15} className="spinning" />
                ) : (
                  <RotateCcw size={15} />
                )}
              </motion.button>
            )}
            <motion.button
              className={`row-action remove-action ${confirmDelete ? 'confirm-delete' : ''}`}
              whileTap={{ scale: 0.93 }}
              disabled={Boolean(busy)}
              aria-label={`${local ? 'Cancel' : confirmDelete ? 'Confirm delete' : 'Delete'} ${file.name}`}
              title={
                local
                  ? 'Cancel upload'
                  : confirmDelete
                    ? 'Confirm removal'
                    : 'Remove file'
              }
              onKeyDown={(event) => {
                if (event.key === 'Escape') resetConfirmation();
              }}
              onClick={requestRemoval}
            >
              {busy === 'remove' ? (
                <LoaderCircle size={15} className="spinning" />
              ) : local ? (
                <X size={16} />
              ) : confirmDelete ? (
                <Check size={16} />
              ) : (
                <Trash2 size={15} strokeWidth={1.5} />
              )}
            </motion.button>
          </>
        )
      }
    />
  );
}

export function FileRow({
  name,
  artwork,
  size,
  tag,
  detail,
  open,
  progress,
  error,
  code,
  actions,
  onContextMenu,
  ref,
}: {
  name: string;
  artwork: React.ReactNode;
  size: number;
  tag?: Tag;
  detail?: string;
  open?: (source: PreviewSource) => void;
  progress?: number;
  error?: string;
  code?: string;
  actions: React.ReactNode;
  onContextMenu?: MouseEventHandler<HTMLLIElement>;
  ref?: Ref<HTMLLIElement>;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
  const stem = extension ? name.slice(0, dot) : name;
  const filename = (
    <>
      <span className="file-stem">{stem}</span>
      {extension && <span className="file-extension">{extension}</span>}
    </>
  );

  return (
    <motion.li
      ref={ref}
      layout="position"
      className={`file-row ${open ? 'file-row-ready' : ''} ${error ? 'file-failed' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
      onContextMenu={onContextMenu}
      onClick={
        open
          ? (event) => {
              const row = event.currentTarget;
              const target = event.target;
              if (
                !trigger.current ||
                !(target instanceof Element) ||
                !row.contains(target) ||
                target.closest('.file-actions button, .file-actions a')
              )
                return;
              const selection = window.getSelection();
              if (
                selection &&
                !selection.isCollapsed &&
                row.contains(selection.anchorNode)
              )
                return;
              trigger.current.focus({ preventScroll: true });
              open({ row, trigger: trigger.current });
            }
          : undefined
      }
    >
      {artwork}
      <div className="file-info">
        {open ? (
          <button
            ref={trigger}
            type="button"
            className="file-name"
            title={name}
            aria-label={`Open preview for ${name}`}
            aria-haspopup="dialog"
            onBlur={(event) => {
              delete event.currentTarget.dataset.peekRestoredFocus;
            }}
          >
            {filename}
          </button>
        ) : (
          <span className="file-name" title={name}>
            {filename}
          </span>
        )}
        <span className="file-meta">
          {tag && <TagBadge tag={tag} />}
          <span className="file-size">{formatSize(size)}</span>
          {detail && (
            <>
              <span className="meta-dot">·</span>
              <span className="file-detail">{detail}</span>
            </>
          )}
          {code && (
            <>
              <span className="meta-dot">·</span>
              <span className="code-value" title={code}>
                {code}
              </span>
            </>
          )}
        </span>
      </div>
      {progress !== undefined && (
        <div
          className="file-transfer"
          role="progressbar"
          aria-label={`Uploading ${name}`}
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="file-progress">
            <span
              style={{
                transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})`,
              }}
            />
          </span>
        </div>
      )}
      <div className="file-actions">{actions}</div>
      {error && (
        <p className="file-error" role="alert">
          {error}
        </p>
      )}
    </motion.li>
  );
}
