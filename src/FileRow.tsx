import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Copy,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileText,
  FileVideo,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { formatSize, type DropFile } from '../shared/files';

export function SavedFile({
  file,
  remove,
  retry,
}: {
  file: DropFile;
  remove: () => void;
  retry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(confirmTimer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(file.code);
      setCopied(true);
      setCopyError(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError(true);
    }
  }

  let detail: string;
  if (file.status === 'queued') detail = 'queued';
  else if (file.status === 'storing') detail = `saving · ${file.progress}%`;
  else if (file.status === 'failed') detail = 'couldn’t save';
  else if (file.expiresAt)
    detail = `expires ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(file.expiresAt)}`;
  else
    detail =
      file.expiration === 'download' ? 'until download' : 'never expires';

  return (
    <FileRow
      name={file.name}
      size={file.size}
      mime={file.mime}
      detail={detail}
      failed={file.status === 'failed'}
      progress={
        file.status === 'storing'
          ? file.progress
          : file.status === 'queued'
            ? 0
            : undefined
      }
      code={
        file.status === 'ready' ? (
          <button
            className={`file-code ${copied ? 'copied' : ''}`}
            onClick={() => {
              void copy();
            }}
            aria-label={`Copy code ${file.code}`}
            title={
              copyError ? 'Copy unavailable — select the code' : 'Copy code'
            }
          >
            <span>{file.code}</span>
            {copied ? <Check size={13} /> : <Copy size={12} />}
          </button>
        ) : undefined
      }
      actions={
        <>
          {file.status === 'failed' && (
            <button
              className="icon-button"
              aria-label={`Retry ${file.name}`}
              onClick={retry}
            >
              <RotateCcw size={17} />
            </button>
          )}
          <button
            className={`icon-button delete-button ${confirmDelete ? 'confirm-delete' : ''}`}
            aria-label={`${confirmDelete ? 'Confirm delete' : 'Delete'} ${file.name}`}
            title={confirmDelete ? 'Click again to delete' : 'Delete file'}
            onClick={() => {
              if (confirmDelete) remove();
              else {
                setConfirmDelete(true);
                confirmTimer.current = setTimeout(
                  () => setConfirmDelete(false),
                  3000,
                );
              }
            }}
          >
            {confirmDelete ? <Check size={17} /> : <Trash2 size={16} />}
          </button>
        </>
      }
    />
  );
}

export function FileRow({
  name,
  size,
  mime,
  detail,
  progress,
  failed,
  code,
  actions,
}: {
  name: string;
  size: number;
  mime: string;
  detail: string;
  progress?: number;
  failed?: boolean;
  code?: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <motion.li
      layout="position"
      className={`file-row ${failed ? 'file-failed' : ''}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, margin: 0 }}
    >
      <span className="file-icon">{fileIcon(name, mime)}</span>
      <div className="file-info">
        <span className="file-name" title={name}>
          {name}
        </span>
        <span className="file-meta">
          <span>{formatSize(size)}</span>
          <span className="meta-dot">·</span>
          <span>{detail}</span>
        </span>
        {code}
        {progress !== undefined && (
          <span
            className="file-progress"
            role="progressbar"
            aria-label={`Uploading ${name}`}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </span>
        )}
      </div>
      <div className="file-actions">{actions}</div>
    </motion.li>
  );
}

function fileIcon(name: string, mime: string) {
  const props = { size: 22, strokeWidth: 1.5 };
  if (mime.startsWith('image/')) return <FileImage {...props} />;
  if (mime.startsWith('video/')) return <FileVideo {...props} />;
  if (mime.startsWith('audio/')) return <FileAudio {...props} />;
  if (/\.(zip|rar|7z|gz|tar)$/i.test(name)) return <FileArchive {...props} />;
  if (/\.(js|ts|tsx|jsx|json|py|go|rs|html|css|sh)$/i.test(name))
    return <FileCode2 {...props} />;
  if (mime.startsWith('text/') || /\.(pdf|docx?|md|txt)$/i.test(name))
    return <FileText {...props} />;
  return <File {...props} />;
}
