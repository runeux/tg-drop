import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { ArrowDownToLine, ArrowRight, LoaderCircle } from 'lucide-react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const isPresent = useIsPresent();

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    return () => request.current?.abort();
  }, []);

  useEffect(() => {
    if (!isPresent) request.current?.abort();
  }, [isPresent]);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim() || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      if (kind === 'password') {
        await api('/session', okSchema, {
          method: 'POST',
          body: JSON.stringify({ password: value }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        onPassword?.();
      } else {
        const result = await api('/lookup', downloadSchema, {
          method: 'POST',
          body: JSON.stringify({ code: value }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setDownload(result);
        window.location.assign(result.url);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(message(error));
      setDownload(null);
      inputRef.current?.focus({ preventScroll: true });
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
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
            request.current?.abort();
            request.current = null;
            setBusy(false);
            setValue(event.target.value);
            setError('');
            setDownload(null);
          }}
        />
        <motion.button
          className="submit-button"
          type="submit"
          aria-label={kind === 'password' ? 'Unlock uploads' : 'Find file'}
          disabled={busy || !value.trim()}
          whileTap={busy || !value.trim() ? undefined : { scale: 0.95 }}
        >
          {busy ? (
            <LoaderCircle size={19} className="spinning" />
          ) : (
            <ArrowRight size={21} />
          )}
        </motion.button>
      </form>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            className="entry-error"
            id="entry-error"
            role="alert"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {download && (
          <motion.div
            className="download-file"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            <div className="download-info">
              <span title={download.name}>{download.name}</span>
              <small>{formatSize(download.size)}</small>
            </div>
            <motion.a
              className="download-button icon-button"
              href={download.url}
              download
              whileTap={{ scale: 0.94 }}
              aria-label={`Download ${download.name}`}
            >
              <ArrowDownToLine size={21} />
            </motion.a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
