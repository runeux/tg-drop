import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDownToLine, ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { api, message, okSchema } from './api';
import { downloadSchema, formatSize } from '../shared/files';

export function EntryForm({
  kind,
  onPassword,
}: {
  kind: 'password' | 'code';
  onPassword?: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [download, setDownload] = useState<{
    name: string;
    size: number;
    url: string;
  } | null>(null);
  const [started, setStarted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      if (kind === 'password') {
        await api('/session', okSchema, {
          method: 'POST',
          body: JSON.stringify({ password: value }),
        });
        onPassword?.();
      } else {
        const result = await api('/lookup', downloadSchema, {
          method: 'POST',
          body: JSON.stringify({ code: value }),
        });
        setDownload(result);
        window.location.assign(result.url);
        setStarted(true);
      }
    } catch (error) {
      setError(message(error));
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="entry">
      <form
        className={`entry-form ${error ? 'has-error' : ''}`}
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <input
          ref={inputRef}
          aria-label={kind === 'password' ? 'Password' : 'File code'}
          aria-describedby={error ? 'entry-error' : undefined}
          aria-invalid={Boolean(error)}
          type={kind === 'password' ? 'password' : 'text'}
          autoComplete={kind === 'password' ? 'current-password' : 'off'}
          autoCapitalize={kind === 'code' ? 'characters' : 'none'}
          autoCorrect="off"
          spellCheck={false}
          className={kind === 'code' ? 'code-input' : ''}
          placeholder={kind === 'password' ? 'password' : 'file code'}
          value={value}
          maxLength={kind === 'password' ? 256 : 32}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
            setDownload(null);
          }}
        />
        <button
          className="submit-button"
          type="submit"
          aria-label={kind === 'password' ? 'Unlock uploads' : 'Find file'}
          disabled={busy || !value.trim()}
        >
          {busy ? (
            <LoaderCircle size={19} className="spinning" />
          ) : (
            <ArrowRight size={21} />
          )}
        </button>
      </form>
      {error && (
        <p className="entry-error" id="entry-error" role="alert">
          {error}
        </p>
      )}
      <AnimatePresence>
        {download && (
          <motion.div
            className="download-file"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="download-info">
              <span title={download.name}>{download.name}</span>
              <small>{formatSize(download.size)}</small>
            </div>
            <a
              className="download-button icon-button"
              href={download.url}
              download
              onClick={() => setStarted(true)}
              aria-label={`Download ${download.name}`}
            >
              {started ? <Check size={21} /> : <ArrowDownToLine size={21} />}
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
