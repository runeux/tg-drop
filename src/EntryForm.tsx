import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from 'motion/react';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { api, message } from './api';
import { resolveSchema, formatSize } from '../shared/files';
import { EntryDownload, type Download } from './EntryDownload';

const ease = [0.22, 1, 0.36, 1] as const;

export function EntryForm({ onPassword }: { onPassword?: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [download, setDownload] = useState<Download | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const isPresent = useIsPresent();
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion ? 0.12 : 0.42;
  const blur = reducedMotion ? 'blur(0px)' : 'blur(5px)';

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!download) inputRef.current?.focus({ preventScroll: true });
  }, [download]);

  useEffect(() => {
    if (!isPresent) request.current?.abort();
  }, [isPresent]);

  const reset = useCallback(() => {
    setDownload(null);
    setValue('');
  }, []);

  useEffect(() => {
    if (!download || !isPresent) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') reset();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [download, isPresent, reset]);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim() || busy || download) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const result = await api('/resolve', resolveSchema, {
        method: 'POST',
        body: JSON.stringify({ value }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.kind === 'upload') onPassword?.();
      else {
        setDownload(result);
        window.location.assign(result.url);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(message(error));
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
        <motion.div
          className="entry-input-row"
          inert={Boolean(download)}
          aria-hidden={Boolean(download)}
          initial={false}
          animate={{
            opacity: download ? 0 : 1,
            x: download && !reducedMotion ? '-105%' : 0,
            filter: download ? blur : 'blur(0px)',
          }}
          transition={{ type: 'tween', duration, ease }}
        >
          <input
            ref={inputRef}
            aria-label="Code or password"
            aria-describedby={error ? 'entry-error' : undefined}
            aria-invalid={Boolean(error)}
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="code or password"
            value={value}
            maxLength={256}
            onChange={(event) => {
              request.current?.abort();
              request.current = null;
              setBusy(false);
              setValue(event.target.value);
              setError('');
            }}
          />
          <motion.button
            className="submit-button"
            type="submit"
            aria-label="Continue"
            disabled={busy || !value.trim()}
            whileTap={busy || !value.trim() ? undefined : { scale: 0.95 }}
          >
            {busy ? (
              <LoaderCircle size={19} className="spinning" />
            ) : (
              <ArrowRight size={21} />
            )}
          </motion.button>
        </motion.div>
        <AnimatePresence>
          {download && <EntryDownload key="download" file={download} />}
        </AnimatePresence>
      </form>
      <motion.button
        className="entry-reset"
        type="button"
        tabIndex={0}
        inert={!download}
        aria-hidden={!download}
        disabled={!download}
        initial={false}
        animate={{
          opacity: download ? 1 : 0,
          y: download || reducedMotion ? 0 : 6,
        }}
        transition={{
          type: 'tween',
          duration: reducedMotion ? 0.12 : 0.3,
          ease,
          delay: download && !reducedMotion ? 0.25 : 0,
        }}
        onClick={reset}
      >
        <ArrowLeft size={13} aria-hidden="true" />
        another code
      </motion.button>
      <span className="visually-hidden" role="status">
        {download
          ? `${download.name}, ${formatSize(download.size)}. Ready to download.`
          : ''}
      </span>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            className="entry-error"
            id="entry-error"
            role="alert"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
