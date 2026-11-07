import { useEffect, useRef, useState, type Ref } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Copy,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { formatSize, type DropFile } from '../shared/files';

export type SavedFileProps = {
  file: DropFile;
  detail?: string;
  local?: boolean;
  remove: () => Promise<void> | void;
  retry: () => Promise<void> | void;
  ref?: Ref<HTMLLIElement>;
};

export function SavedFile({
  file,
  detail,
  local,
  remove,
  retry,
  editCode,
  ref,
}: SavedFileProps & { editCode: (file: DropFile) => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<'remove' | 'retry' | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(
    () => () => {
      clearTimeout(copyTimer.current);
      clearTimeout(confirmTimer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(file.code);
      setCopied(true);
      setCopyError(false);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(true);
    }
  }

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

  return (
    <FileRow
      ref={ref}
      name={file.name}
      size={file.size}
      detail={status}
      downloadUrl={
        file.status === 'ready' ? `/api/files/${file.id}/download` : undefined
      }
      error={failure}
      progress={progress}
      code={
        file.status === 'ready' ? (
          <>
            <motion.button
              className={`file-code ${copied ? 'copied' : ''} ${copyError ? 'copy-error' : ''}`}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                void copy();
              }}
              aria-label={`Copy code ${file.code}`}
              title={
                copyError
                  ? 'Select the code to copy'
                  : copied
                    ? 'Copied'
                    : 'Copy code'
              }
            >
              <span className="code-value">{file.code}</span>
              <span className="code-symbol" aria-hidden="true">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={copied ? 'copied' : 'copy'}
                    initial={{ opacity: 0, scale: 0.75 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.75 }}
                    transition={{ duration: 0.16 }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={13} />}
                  </motion.span>
                </AnimatePresence>
              </span>
            </motion.button>
            <motion.button
              className="row-action"
              whileTap={{ scale: 0.93 }}
              aria-label={`Edit code for ${file.name}`}
              title="Edit code"
              onClick={() => editCode(file)}
            >
              <Pencil size={14} strokeWidth={1.7} />
            </motion.button>
          </>
        ) : undefined
      }
      actions={
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
              if (event.key === 'Escape') setConfirmDelete(false);
            }}
            onClick={() => {
              if (local || confirmDelete) {
                void perform('remove');
                return;
              }
              setConfirmDelete(true);
              clearTimeout(confirmTimer.current);
              confirmTimer.current = setTimeout(
                () => setConfirmDelete(false),
                3000,
              );
            }}
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
      }
    />
  );
}

export function FileRow({
  name,
  size,
  detail,
  downloadUrl,
  progress,
  error,
  code,
  actions,
  ref,
}: {
  name: string;
  size: number;
  detail?: string;
  downloadUrl?: string;
  progress?: number;
  error?: string;
  code?: React.ReactNode;
  actions: React.ReactNode;
  ref?: Ref<HTMLLIElement>;
}) {
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
  const stem = extension ? name.slice(0, dot) : name;

  return (
    <motion.li
      ref={ref}
      layout="position"
      className={`file-row ${error ? 'file-failed' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
    >
      <div className="file-info">
        <a
          className="file-name"
          title={name}
          aria-label={name}
          href={downloadUrl}
          download
        >
          <span className="file-stem">{stem}</span>
          {extension && <span className="file-extension">{extension}</span>}
        </a>
        <span className="file-meta">
          <span className="file-size">{formatSize(size)}</span>
          {detail && (
            <>
              <span className="meta-dot">·</span>
              <span className="file-detail">{detail}</span>
            </>
          )}
        </span>
      </div>
      {code && <div className="file-code-slot">{code}</div>}
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
