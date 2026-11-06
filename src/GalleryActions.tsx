import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import type { DropFile } from '../shared/files';

export function GalleryActions({ file }: { file: DropFile }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
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
    <div className="gallery-actions">
      <a
        className="gallery-action"
        href={`/api/files/${file.id}/download`}
        download
        aria-label={`Download ${file.name}`}
        title="Download"
      >
        <Download size={18} strokeWidth={1.7} />
      </a>
      <button
        className="gallery-action"
        onClick={() => void copy()}
        aria-label={`Copy code ${file.code}`}
        title={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? <Check size={18} /> : <Copy size={17} strokeWidth={1.7} />}
      </button>
      <span
        className={failed ? 'gallery-copy-error' : 'visually-hidden'}
        role="status"
      >
        {failed ? `Copy this code: ${file.code}` : copied ? 'Code copied' : ''}
      </span>
    </div>
  );
}
