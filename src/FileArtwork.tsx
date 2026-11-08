import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import type { DropFile } from '../shared/files';
import { mediaKind } from '../shared/media';
import { extensionOf } from './file-extension';
import './file-artwork.css';

const iconGroups = {
  pdf: ['pdf'],
  zip: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst'],
  audio: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'aiff'],
  image: [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'svg',
    'heic',
    'avif',
    'bmp',
    'tiff',
  ],
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpeg'],
  table: ['csv', 'tsv', 'xls', 'xlsx', 'ods'],
  powerpoint: ['ppt', 'pptx', 'odp', 'key'],
  word: ['doc', 'docx', 'odt', 'rtf', 'pages'],
  settings: ['ini', 'conf', 'cfg', 'toml', 'yaml', 'yml', 'json', 'xml'],
};
const iconsByExtension = new Map(
  Object.entries(iconGroups).flatMap(([icon, extensions]) =>
    extensions.map((extension) => [extension, icon] as const),
  ),
);

export function FileArtwork({ file }: { file: DropFile }) {
  const kind = mediaKind(file);
  if (file.status !== 'ready' || !kind) {
    return (
      <span className="file-artwork">
        <FileTypeIcon file={file} />
      </span>
    );
  }

  return <MediaThumbnail file={file} kind={kind} />;
}

export function FileTypeIcon({ file }: { file: DropFile }) {
  const kind = mediaKind(file);
  const icon =
    kind ?? iconsByExtension.get(extensionOf(file.name)) ?? 'document';
  return (
    <img
      className="file-type-icon"
      src={`/assets/file-icons/${icon}.svg`}
      alt=""
    />
  );
}

function MediaThumbnail({
  file,
  kind,
}: {
  file: DropFile;
  kind: 'image' | 'video';
}) {
  const artwork = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );
  const src = `/api/files/${file.id}/preview`;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    if (artwork.current) observer.observe(artwork.current);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={artwork}
      className="file-artwork file-preview"
      data-status={status}
    >
      {status !== 'ready' && <FileTypeIcon file={file} />}
      {visible &&
        status !== 'failed' &&
        (kind === 'video' ? (
          <video
            className="file-thumbnail"
            src={`${src}#t=0.001`}
            preload="metadata"
            muted
            playsInline
            aria-hidden="true"
            onLoadedData={() => setStatus('ready')}
            onError={() => setStatus('failed')}
          />
        ) : (
          <img
            className="file-thumbnail"
            src={src}
            alt=""
            decoding="async"
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('failed')}
          />
        ))}
      {kind === 'video' && status === 'ready' && (
        <span className="file-thumbnail-play" aria-hidden="true">
          <Play size={11} fill="currentColor" />
        </span>
      )}
    </span>
  );
}
