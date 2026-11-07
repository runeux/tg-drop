import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MasonryPhotoAlbum } from 'react-photo-album';
import { ImageOff, Play } from 'lucide-react';
import type { DropFile } from '../shared/files';
import { mediaKind, mediaType } from '../shared/media';
import { GalleryActions } from './GalleryActions';
import 'react-photo-album/masonry.css';
import './gallery.css';

const GalleryViewer = lazy(() => import('./GalleryViewer'));
type Dimensions = { width: number; height: number };

export default function Gallery({
  files,
  remove,
  editCode,
}: {
  files: DropFile[];
  remove: (id: string) => Promise<void>;
  editCode: (file: DropFile) => void;
}) {
  const [dimensions, setDimensions] = useState<Record<string, Dimensions>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const measure = useCallback((id: string, width: number, height: number) => {
    if (!width || !height) return;
    setDimensions((current) =>
      current[id]?.width === width && current[id]?.height === height
        ? current
        : { ...current, [id]: { width, height } },
    );
  }, []);
  const photos = useMemo(
    () =>
      files.map((file) => ({
        key: file.id,
        src: `/api/files/${file.id}/preview`,
        file,
        ...(file.width && file.height
          ? { width: file.width, height: file.height }
          : (dimensions[file.id] ?? { width: 1, height: 1 })),
      })),
    [files, dimensions],
  );
  const selectedFile = files.find((file) => file.id === selected);

  return (
    <>
      <MasonryPhotoAlbum
        photos={photos}
        spacing={12}
        columns={(width) =>
          width < 340 ? 1 : width < 650 ? 2 : width < 940 ? 3 : 4
        }
        render={{
          photo: (_, { photo }) => (
            <GalleryCard
              key={photo.key}
              file={photo.file}
              open={() => setSelected(photo.file.id)}
              editCode={editCode}
              measure={
                photo.file.width && photo.file.height ? undefined : measure
              }
              width={photo.width}
              height={photo.height}
            />
          ),
        }}
      />
      {selectedFile && (
        <Suspense fallback={null}>
          <GalleryViewer
            key={selectedFile.id}
            file={selectedFile}
            close={() => setSelected(null)}
            remove={() => remove(selectedFile.id)}
            editCode={editCode}
          />
        </Suspense>
      )}
    </>
  );
}

function GalleryCard({
  file,
  open,
  editCode,
  measure,
  width,
  height,
}: {
  file: DropFile;
  open: () => void;
  editCode: (file: DropFile) => void;
  width: number;
  height: number;
  measure?: (id: string, width: number, height: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  const src = `/api/files/${file.id}/preview`;
  const video = mediaKind(file) === 'video';
  return (
    <article ref={element} className="gallery-card" aria-label={file.name}>
      <button
        id={`gallery-open-${file.id}`}
        className="gallery-open"
        style={{ aspectRatio: `${width} / ${height}` }}
        data-loaded={loaded}
        aria-label={`Open ${file.name}`}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          open();
        }}
      >
        {!visible ? (
          <span className="gallery-placeholder" />
        ) : failed ? (
          <span className="gallery-fallback">
            <ImageOff size={26} />
            <span>{file.name}</span>
            <small>preview unavailable</small>
          </span>
        ) : video ? (
          <video
            src={`${src}#t=0.001`}
            preload="metadata"
            muted
            playsInline
            onLoadedData={() => setLoaded(true)}
            onLoadedMetadata={(event) =>
              measure?.(
                file.id,
                event.currentTarget.videoWidth,
                event.currentTarget.videoHeight,
              )
            }
            onError={() => setFailed(true)}
          />
        ) : (
          <img
            src={src}
            alt={file.name}
            loading="lazy"
            decoding="async"
            onLoad={(event) => {
              setLoaded(true);
              measure?.(
                file.id,
                event.currentTarget.naturalWidth,
                event.currentTarget.naturalHeight,
              );
            }}
            onError={() => setFailed(true)}
          />
        )}
        <span className="gallery-shade" />
        {(video || mediaType(file) === 'image/gif') && (
          <span className="gallery-badge">
            {video ? <Play size={12} fill="currentColor" /> : 'gif'}
          </span>
        )}
      </button>
      <GalleryActions file={file} editCode={editCode} />
    </article>
  );
}
