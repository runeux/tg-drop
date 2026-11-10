import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Pencil, Trash2 } from 'lucide-react';
import type { DropFile } from '../shared/files';
import { FileActionMenu } from './FileActionMenu';

export function MediaViewerActions({
  file,
  editCode,
  remove,
  close,
  layout,
}: {
  file: DropFile;
  editCode: (file: DropFile) => void;
  remove: () => Promise<void>;
  close: () => void;
  layout: 'file' | 'media';
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

  function requestRemoval() {
    if (!confirm) {
      setConfirm(true);
      return false;
    }
    setBusy(true);
    void remove()
      .then(close)
      .finally(() => setBusy(false));
    return true;
  }

  const downloadUrl = `/api/files/${file.id}/download`;

  const menu = (
    <FileActionMenu
      name={file.name}
      code={file.code}
      downloadUrl={layout === 'media' ? downloadUrl : undefined}
      busy={busy}
      confirmDelete={confirm}
      edit={() => editCode(file)}
      remove={requestRemoval}
      resetConfirmation={() => setConfirm(false)}
      className={
        layout === 'media' ? 'viewer-action viewer-mobile-menu' : 'peek-more'
      }
    />
  );
  if (layout === 'file') return menu;

  return (
    <>
      <div className="viewer-actions viewer-actions-desktop">
        <a
          className="viewer-action"
          href={downloadUrl}
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
          onClick={requestRemoval}
        >
          {confirm ? <Check size={18} /> : <Trash2 size={18} />}
        </button>
        <span
          className={failed ? 'viewer-copy-error' : 'visually-hidden'}
          role="status"
        >
          {failed
            ? `Copy this code: ${file.code}`
            : copied
              ? 'Code copied'
              : ''}
        </span>
      </div>
      {menu}
    </>
  );
}
