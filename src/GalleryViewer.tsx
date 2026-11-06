import { useEffect, useRef, useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import { formatSize, type DropFile } from '../shared/files';
import { mediaKind } from '../shared/media';
import { GalleryActions } from './GalleryActions';

export default function GalleryViewer({
  file,
  close,
  remove,
}: {
  file: DropFile;
  close: () => void;
  remove: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previous;
      document
        .getElementById(`gallery-open-${file.id}`)
        ?.focus({ preventScroll: true });
    };
  }, [file.id]);
  const src = `/api/files/${file.id}/preview`;

  return (
    <dialog
      ref={dialog}
      className="gallery-viewer"
      aria-label={`Preview ${file.name}`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <header className="viewer-toolbar">
        <div className="viewer-title">
          <span>{file.name}</span>
          <small>{formatSize(file.size)}</small>
        </div>
        <GalleryActions file={file} />
        <button
          className="gallery-action"
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
        <button
          className="gallery-action"
          aria-label="Close preview"
          title="Close"
          onClick={close}
        >
          <X size={22} />
        </button>
      </header>
      <div
        className="viewer-stage"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {failed ? (
          <p className="viewer-fallback">
            this browser can’t preview this format.
            <br />
            you can still download the original.
          </p>
        ) : mediaKind(file) === 'video' ? (
          <video
            className="viewer-media"
            src={src}
            controls
            playsInline
            autoPlay
            onError={() => setFailed(true)}
          />
        ) : (
          <img
            className="viewer-media"
            src={src}
            alt={file.name}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </dialog>
  );
}
