import { useEffect, useRef } from 'react';
import { motion, useIsPresent, useReducedMotion } from 'motion/react';
import { ArrowDownToLine } from 'lucide-react';
import { formatSize } from '../shared/files';

export type Download = { name: string; size: number; url: string };

export function EntryDownload({ file }: { file: Download }) {
  const extension = /\.([a-z0-9]{1,10})$/i.exec(file.name)?.[1]?.toLowerCase();
  const fileType =
    extension === 'pdf'
      ? 'pdf document'
      : extension
        ? `${extension} file`
        : 'file';
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const isPresent = useIsPresent();
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion ? 0.12 : 0.42;
  const blur = reducedMotion ? 'blur(0px)' : 'blur(5px)';
  const ease = [0.22, 1, 0.36, 1] as const;

  useEffect(() => {
    if (isPresent) downloadRef.current?.focus({ preventScroll: true });
  }, [isPresent, file]);

  return (
    <motion.div
      className="entry-result"
      initial="hidden"
      animate="visible"
      exit="hidden"
      inert={!isPresent}
      aria-hidden={!isPresent}
      variants={{
        hidden: { opacity: 0, transition: { duration: 0.12 } },
        visible: { opacity: 1, transition: { duration: 0 } },
      }}
    >
      <motion.span
        className="download-name"
        title={file.name}
        variants={{
          hidden: {
            opacity: 0,
            x: reducedMotion ? 0 : 80,
            filter: blur,
          },
          visible: { opacity: 1, x: 0, filter: 'blur(0px)' },
        }}
        transition={{
          type: 'tween',
          duration,
          ease,
          delay: reducedMotion ? 0 : 0.06,
        }}
      >
        {file.name}
      </motion.span>
      <motion.a
        ref={downloadRef}
        className="download-button submit-button"
        href={file.url}
        download
        whileTap={{ scale: 0.95 }}
        aria-label={`Download ${file.name}`}
        variants={{
          hidden: {
            opacity: 0,
            x: reducedMotion ? 0 : 32,
            scale: reducedMotion ? 1 : 0.92,
            filter: blur,
          },
          visible: { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' },
        }}
        transition={{
          type: 'tween',
          duration: reducedMotion ? 0.12 : 0.32,
          ease,
          delay: reducedMotion ? 0 : 0.24,
        }}
      >
        <ArrowDownToLine size={21} />
      </motion.a>
      <motion.div
        className="download-meta"
        variants={{
          hidden: {
            opacity: 0,
            y: reducedMotion ? 0 : 8,
            filter: blur,
          },
          visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
        }}
        transition={{
          type: 'tween',
          duration: reducedMotion ? 0.12 : 0.3,
          ease,
          delay: reducedMotion ? 0 : 0.18,
        }}
      >
        <span className="download-type">{fileType}</span>
        <span className="meta-dot" aria-hidden="true">
          ·
        </span>
        <span className="file-size">{formatSize(file.size)}</span>
      </motion.div>
    </motion.div>
  );
}
