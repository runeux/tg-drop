import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from 'motion/react';
import { ArrowLeft, ArrowRight, LoaderCircle, LogIn } from 'lucide-react';
import { api, message, okSchema } from './api';
import { downloadSchema, formatSize } from '../shared/files';
import { EntryDownload, type Download } from './EntryDownload';
import { HotkeyBadge } from './HotkeyBadge';

const ease = [0.22, 1, 0.36, 1] as const;

function lookupCode(code: string, signal: AbortSignal) {
  return api('/lookup', downloadSchema, {
    method: 'POST',
    body: JSON.stringify({ code }),
    signal,
  });
}

export function EntryForm({
  sharePath,
  clearSharePath,
  onPassword,
}: {
  sharePath: string;
  clearSharePath: () => void;
  onPassword: () => void;
}) {
  const [mode, setMode] = useState<'code' | 'password'>('code');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [download, setDownload] = useState<Download | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const isPresent = useIsPresent();
  const reducedMotion = useReducedMotion();
  const passwordMode = mode === 'password';
  const duration = reducedMotion ? 0.12 : 0.42;
  const blur = reducedMotion ? 'blur(0px)' : 'blur(5px)';

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!download) inputRef.current?.focus({ preventScroll: true });
  }, [download]);

  useEffect(() => {
    if (!isPresent) request.current?.abort();
  }, [isPresent]);

  useEffect(() => {
    if (!sharePath) return;
    const controller = new AbortController();
    request.current = controller;
    async function lookup() {
      let code: string;
      try {
        code = decodeURIComponent(sharePath);
      } catch {
        setError('Code not found.');
        request.current = null;
        return;
      }
      setBusy(true);
      try {
        const result = await lookupCode(code, controller.signal);
        if (!controller.signal.aborted) setDownload(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(message(error));
      } finally {
        if (request.current === controller) {
          request.current = null;
          setBusy(false);
        }
      }
    }
    void lookup();
    return () => controller.abort();
  }, [sharePath]);

  const reset = useCallback(() => {
    clearSharePath();
    setDownload(null);
    setValue('');
  }, [clearSharePath]);

  useEffect(() => {
    if (!download || !isPresent) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') reset();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [download, isPresent, reset]);

  function updateValue(value: string) {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setValue(value);
    setError('');
  }

  function switchMode() {
    updateValue('');
    clearSharePath();
    setMode((current) => (current === 'code' ? 'password' : 'code'));
    inputRef.current?.focus({ preventScroll: true });
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim() || busy || download) return;
    clearSharePath();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      if (passwordMode) {
        await api('/session', okSchema, {
          method: 'POST',
          body: JSON.stringify({ password: value }),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) onPassword();
      } else {
        const result = await lookupCode(value, controller.signal);
        if (!controller.signal.aborted) setDownload(result);
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
      <motion.button
        className="code-submit entry-mode"
        type="button"
        aria-label={passwordMode ? 'Use a code' : 'Sign in'}
        title={passwordMode ? 'Use a code' : 'Sign in'}
        inert={Boolean(download)}
        aria-hidden={Boolean(download)}
        onClick={switchMode}
        initial={false}
        animate={{ opacity: download ? 0 : 1 }}
        transition={{ type: 'tween', duration, ease }}
        whileTap={{ scale: 0.95 }}
      >
        {passwordMode ? (
          <ArrowLeft size={18} aria-hidden="true" />
        ) : (
          <LogIn size={18} aria-hidden="true" />
        )}
      </motion.button>
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
          <div className="entry-field">
            <input
              ref={inputRef}
              aria-label={passwordMode ? 'Password' : 'Code'}
              aria-describedby={error ? 'entry-error' : undefined}
              aria-invalid={Boolean(error)}
              type={passwordMode ? 'password' : 'text'}
              autoComplete={passwordMode ? 'current-password' : 'off'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={mode}
              value={value}
              maxLength={256}
              onChange={(event) => updateValue(event.target.value)}
            />
            <div className="entry-placeholder" aria-hidden="true">
              {(['code', 'password'] as const).map((label) => (
                <motion.span
                  key={label}
                  initial={false}
                  animate={{
                    opacity: label === mode ? 1 : 0,
                    y:
                      reducedMotion || label === mode
                        ? 0
                        : label === 'code'
                          ? -4
                          : 4,
                  }}
                  transition={
                    reducedMotion
                      ? { duration: 0.12 }
                      : { type: 'spring', duration: 0.24, bounce: 0 }
                  }
                >
                  {label}
                </motion.span>
              ))}
            </div>
          </div>
          <motion.button
            className="code-submit"
            type="submit"
            aria-label="Continue"
            disabled={busy || !value.trim()}
            whileTap={busy || !value.trim() ? undefined : { scale: 0.95 }}
          >
            {busy ? (
              <LoaderCircle size={16} className="spinning" />
            ) : (
              <ArrowRight size={18} />
            )}
          </motion.button>
        </motion.div>
        <AnimatePresence>
          {download && <EntryDownload key="download" file={download} />}
        </AnimatePresence>
      </form>
      <motion.button
        className="entry-reset"
        aria-keyshortcuts="Escape"
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
        <ArrowLeft size={13} aria-hidden="true" className="entry-reset-arrow" />
        back
        <HotkeyBadge>Esc</HotkeyBadge>
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
