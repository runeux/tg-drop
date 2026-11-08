import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import type { DropFile } from '../shared/files';
import { mediaKind } from '../shared/media';
import { extensionOf } from './file-extension';
import './file-artwork.css';

const exactIcons = new Set([
  '7z',
  'ai',
  'avi',
  'css',
  'csv',
  'doc',
  'exe',
  'flac',
  'gif',
  'html',
  'iso',
  'jpg',
  'js',
  'json',
  'mp3',
  'mp4',
  'pdf',
  'png',
  'ppt',
  'psd',
  'rar',
  'rtf',
  'svg',
  'wav',
  'xls',
  'xml',
  'zip',
]);
const iconGroups = {
  archive: ['tar', 'gz', 'bz2', 'xz', 'zst', 'tgz'],
  audio: ['m4a', 'aac', 'ogg', 'opus', 'aiff'],
  jpg: ['jpeg', 'webp', 'heic', 'avif', 'bmp', 'tiff'],
  video: ['mov', 'mkv', 'webm', 'm4v', 'mpeg'],
  xls: ['tsv', 'xlsx', 'ods'],
  ppt: ['pptx', 'odp', 'key'],
  doc: ['docx', 'odt', 'pages'],
  text: ['txt', 'md', 'ini', 'conf', 'cfg', 'toml', 'yaml', 'yml', 'log'],
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
  const extension = extensionOf(file.name);
  const kind = mediaKind(file);
  const icon = exactIcons.has(extension)
    ? extension
    : (iconsByExtension.get(extension) ??
      (kind === 'image' ? 'jpg' : kind) ??
      'unknown');
  return (
    <img
      className="file-type-icon"
      src={`/assets/file-icons-v2/${icon}.svg`}
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
