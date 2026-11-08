import { useState } from 'react';
import { ArrowLeft, Check, Share, X } from 'lucide-react';
import { formatSize, type DropFile } from '../shared/files';
import { mediaKind } from '../shared/media';
import { FileTypeIcon } from './FileArtwork';
import type { PreviewSource } from './FileRow';
import { MediaViewerActions } from './MediaViewerActions';
import { shareUrl } from './share-url';
import { usePeekDialog } from './use-peek-dialog';
import './media-viewer.css';

const addedDate = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function FilePeek({
  file,
  source,
  close,
  remove,
  editCode,
}: {
  file: DropFile;
  source: PreviewSource;
  close: () => void;
  remove: () => Promise<void>;
  editCode: (file: DropFile) => void;
}) {
  const kind = mediaKind(file);
  const [failed, setFailed] = useState(() =>
    Boolean(source.row.querySelector('.file-preview[data-status="failed"]')),
  );
  const [sharedCode, setSharedCode] = useState('');
  const [shareError, setShareError] = useState(false);
  const showMedia = kind !== null && !failed;
  const anchor =
    source.row.querySelector<HTMLElement>('.file-artwork') ?? source.row;
  const src = `/api/files/${file.id}/preview`;

  const { dialog, panel, scrim, dismiss } = usePeekDialog(
    source,
    anchor,
    showMedia,
    close,
  );
  const shared = sharedCode === file.code;
  const date = new Date(file.createdAt);
  const dateLabel = `added ${addedDate.format(date)}`;

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl(file.code));
      setSharedCode(file.code);
      setShareError(false);
    } catch {
      setShareError(true);
    }
  }
  const actions = (
    <MediaViewerActions
      file={file}
      editCode={editCode}
      remove={remove}
      close={dismiss}
      mobileMenu={showMedia}
    />
  );
  const closeButton = (
    <button
      type="button"
      className="viewer-action peek-close"
      aria-label="Close preview"
      title="Close"
      onClick={dismiss}
    >
      <X className="peek-close-x" size={20} aria-hidden="true" />
      {showMedia && (
        <ArrowLeft className="peek-close-back" size={19} aria-hidden="true" />
      )}
    </button>
  );

  return (
    <dialog
      ref={dialog}
      className="peek-dialog"
      aria-label={`Preview ${file.name}`}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        ref={scrim}
        className={`peek-scrim ${showMedia ? '' : 'file-peek-scrim'}`}
      />
      <div
        ref={panel}
        className={showMedia ? 'media-viewer' : 'file-peek'}
        style={showMedia ? { opacity: 0 } : undefined}
      >
        {showMedia ? (
          <>
            <header className="viewer-toolbar">
              {closeButton}
              <div className="viewer-title">
                <span>{file.name}</span>
                <small className="viewer-size">{formatSize(file.size)}</small>
                <small className="viewer-code">{file.code}</small>
              </div>
              {actions}
            </header>
            <div
              className="viewer-stage"
              onClick={(event) => {
                if (event.target === event.currentTarget) dismiss();
              }}
            >
              {kind === 'video' ? (
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
          </>
        ) : (
          <>
            <div className="peek-file-material" aria-hidden="true" />
            {closeButton}
            <button
              type="button"
              className="viewer-action peek-share"
              aria-label="Copy share link"
              title={shared ? 'Link copied' : 'Copy share link'}
              onClick={() => void copyShareLink()}
            >
              {shared ? (
                <Check size={18} aria-hidden="true" />
              ) : (
                <Share size={18} aria-hidden="true" />
              )}
            </button>
            <span
              className={shareError ? 'peek-share-error' : 'visually-hidden'}
              role="status"
            >
              {shareError ? 'couldn’t copy link' : shared ? 'link copied' : ''}
            </span>
            <div className="peek-file-artwork">
              <FileTypeIcon file={file} />
            </div>
            <div className="peek-file-info">
              <h2>{file.name}</h2>
              <div className="peek-file-meta">
                <div className="peek-file-facts">
                  <span>{formatSize(file.size)}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={date.toISOString()} title={dateLabel}>
                    {dateLabel}
                  </time>
                </div>
                <span className="code-value" title={file.code}>
                  {file.code}
                </span>
              </div>
              {actions}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
