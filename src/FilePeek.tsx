import { useState, type ReactNode } from 'react';
import {
  RiArrowLeftLine,
  RiCheckLine,
  RiCloseLine,
  RiDownloadLine,
  RiShareLine,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatSize, type DropFile } from '../shared/files';
import { mediaKind } from '../shared/media';
import { FileTypeIcon } from './FileArtwork';
import type { PreviewSource } from './FileRow';
import { MediaViewerActions } from './MediaViewerActions';
import { shareUrl } from './share-url';
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
  children,
}: {
  file: DropFile;
  source: PreviewSource;
  close: () => void;
  remove: () => Promise<void>;
  editCode: (file: DropFile) => void;
  children?: ReactNode;
}) {
  const kind = mediaKind(file);
  const [open, setOpen] = useState(true);
  const [failed, setFailed] = useState(() =>
    Boolean(source.row.querySelector('.file-preview[data-status="failed"]')),
  );
  const [sharedCode, setSharedCode] = useState('');
  const [shareError, setShareError] = useState(false);
  const showMedia = kind !== null && !failed;
  const src = `/api/files/${file.id}/preview`;
  const shared = sharedCode === file.code;
  const date = new Date(file.createdAt);
  const dateLabel = `added ${addedDate.format(date)}`;
  const size = formatSize(file.size);

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
      close={() => setOpen(false)}
      layout={showMedia ? 'media' : 'file'}
    />
  );

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        className={showMedia ? 'media-viewer' : 'file-peek'}
        closeLabel="Close preview"
        showCloseButton={!showMedia}
        finalFocus={() => {
          if (!source.trigger.isConnected) return true;
          source.trigger.setAttribute('data-peek-restored-focus', '');
          return source.trigger;
        }}
      >
        {showMedia ? (
          <>
            <header className="viewer-toolbar">
              <DialogClose
                render={
                  <Button
                    variant="secondary"
                    size="icon-lg"
                    className="viewer-action peek-close"
                  />
                }
                aria-label="Close preview"
              >
                <RiCloseLine className="peek-close-x" aria-hidden="true" />
                <RiArrowLeftLine
                  className="peek-close-back"
                  aria-hidden="true"
                />
              </DialogClose>
              <div className="viewer-title">
                <DialogTitle>
                  <span className="sr-only">Preview </span>
                  {file.name}
                </DialogTitle>
                <DialogDescription className="viewer-size">
                  {size}
                </DialogDescription>
                <small className="viewer-code">{file.code}</small>
              </div>
              {actions}
            </header>
            <div
              className="viewer-stage"
              onClick={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
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
            <DialogHeader className="peek-file-header">
              <DialogTitle>
                <span className="sr-only">Preview </span>
                {file.name}
              </DialogTitle>
              <DialogDescription className="peek-file-facts">
                <span>{size}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={date.toISOString()}>{dateLabel}</time>
              </DialogDescription>
            </DialogHeader>
            <div className="peek-file-artwork">
              <FileTypeIcon file={file} />
            </div>
            <div className="peek-file-meta">
              <span>share code</span>
              <code className="code-value" title={file.code}>
                {file.code}
              </code>
            </div>
            <DialogFooter className="peek-file-footer">
              {actions}
              <Button
                variant="outline"
                size="lg"
                aria-label="Copy share link"
                onClick={() => void copyShareLink()}
              >
                {shared ? (
                  <RiCheckLine data-icon="inline-start" />
                ) : (
                  <RiShareLine data-icon="inline-start" />
                )}
                {shared ? 'copied' : 'share link'}
              </Button>
              <a
                className={buttonVariants({ size: 'lg' })}
                href={`/api/files/${file.id}/download`}
                download
                aria-label={`Download ${file.name}`}
              >
                <RiDownloadLine data-icon="inline-start" /> download
              </a>
            </DialogFooter>
            <span
              className={shareError ? 'peek-share-error' : 'visually-hidden'}
              role="status"
            >
              {shareError ? 'couldn’t copy link' : shared ? 'link copied' : ''}
            </span>
          </>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}
