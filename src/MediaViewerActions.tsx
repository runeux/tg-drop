import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Pencil, Trash2 } from 'lucide-react';
import type { DropFile } from '../shared/files';

export function MediaViewerActions({
  file,
  editCode,
  remove,
  close,
}: {
  file: DropFile;
  editCode: (file: DropFile) => void;
  remove: () => Promise<void>;
  close: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(file.code);
      setCopied(true);
      setFailed(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="viewer-actions">
      <a
        className="viewer-action"
        href={`/api/files/${file.id}/download`}
        download
        aria-label={`Download ${file.name}`}
        title="Download"
      >
        <Download size={18} strokeWidth={1.7} />
      </a>
      <button
        className="viewer-action"
        onClick={() => void copy()}
        aria-label={`Copy code ${file.code}`}
        title={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? <Check size={18} /> : <Copy size={17} strokeWidth={1.7} />}
      </button>
      <button
        className="viewer-action"
        onClick={() => editCode(file)}
        aria-label={`Edit code for ${file.name}`}
        title="Edit code"
      >
        <Pencil size={17} strokeWidth={1.7} />
      </button>
      <button
        className="viewer-action"
        disabled={busy}
        aria-label={`${confirm ? 'Confirm delete' : 'Delete'} ${file.name}`}
        title={confirm ? 'Confirm removal' : 'Remove file'}
        onClick={() => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          setBusy(true);
          void remove()
            .then(close)
            .finally(() => setBusy(false));
        }}
      >
        {confirm ? <Check size={18} /> : <Trash2 size={18} />}
      </button>
      <span
        className={failed ? 'viewer-copy-error' : 'visually-hidden'}
        role="status"
      >
        {failed ? `Copy this code: ${file.code}` : copied ? 'Code copied' : ''}
      </span>
    </div>
  );
}
