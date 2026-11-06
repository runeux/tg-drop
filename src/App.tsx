import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowUpFromLine, LoaderCircle, X } from 'lucide-react';
import { api, message, okSchema, sessionSchema } from './api';
import { EntryForm } from './EntryForm';
import { captureDrop, prepareDrop } from './selection';

const Uploads = lazy(() => import('./Uploads'));

type Screen = 'loading' | 'entry' | 'upload';

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [authenticated, setAuthenticated] = useState(false);
  const [maxFileBytes, setMaxFileBytes] = useState(4_000_000_000);
  const [loggingOut, setLoggingOut] = useState(false);
  const [authError, setAuthError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selectionError, setSelectionError] = useState('');
  const [preparing, setPreparing] = useState('');
  const preparingDrop = useRef(false);
  const dragDepth = useRef(0);
  const uploadStage = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    void api('/session', sessionSchema, { signal: controller.signal })
      .then((session) => {
        if (controller.signal.aborted) return;
        setAuthenticated(session.authenticated);
        setScreen(session.authenticated ? 'upload' : 'entry');
        setMaxFileBytes(session.maxFileBytes);
      })
      .catch(() => {
        if (!controller.signal.aborted) setScreen('entry');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (screen === 'upload')
      uploadStage.current?.focus({ preventScroll: true });
  }, [screen]);

  const acceptFiles = useCallback(
    (files: File[]) => {
      setPendingFiles((pending) => [...pending, ...files]);
      setScreen(authenticated ? 'upload' : 'entry');
    },
    [authenticated],
  );

  useEffect(() => {
    const isFile = (event: DragEvent) =>
      event.dataTransfer?.types.includes('Files');
    const enter = (event: DragEvent) => {
      if (!isFile(event)) return;
      event.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!isFile(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!isFile(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!isFile(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (!event.dataTransfer) return;
      if (preparingDrop.current) {
        setSelectionError('Wait for the current archive to finish.');
        return;
      }
      const items = captureDrop(event.dataTransfer);
      preparingDrop.current = true;
      setSelectionError('');
      void prepareDrop(items, maxFileBytes, setPreparing)
        .then(({ files, errors }) => {
          if (files.length) acceptFiles(files);
          setSelectionError(errors.join('\n'));
        })
        .finally(() => {
          preparingDrop.current = false;
          setPreparing('');
        });
    };
    const reset = () => {
      dragDepth.current = 0;
      setDragging(false);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('blur', reset);
    };
  }, [acceptFiles, maxFileBytes]);

  const back = async () => {
    setLoggingOut(true);
    setAuthError('');
    try {
      await api('/session', okSchema, { method: 'DELETE' });
      setAuthenticated(false);
      setScreen('entry');
      setPendingFiles([]);
    } catch (error) {
      setAuthError(message(error));
    } finally {
      setLoggingOut(false);
    }
  };
  const receivedPending = useCallback(() => setPendingFiles([]), []);
  const unauthorized = useCallback(() => {
    setAuthenticated(false);
    setScreen('entry');
  }, []);

  return (
    <>
      <main className="app">
        <AnimatePresence initial={false}>
          {screen === 'upload' && (
            <motion.button
              className="back icon-button"
              aria-label="Back"
              onClick={() => void back()}
              disabled={loggingOut}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              whileTap={{ scale: 0.92 }}
            >
              <ArrowLeft size={21} />
            </motion.button>
          )}
        </AnimatePresence>
        <div className="centered-stage" inert={screen === 'upload'}>
          <AnimatePresence initial={false}>
            {screen === 'entry' && (
              <motion.div
                className="screen screen-entry"
                key={screen}
                initial={{
                  opacity: 0,
                  y: reducedMotion ? 0 : 8,
                  scale: reducedMotion ? 1 : 0.985,
                }}
                animate={{ opacity: 1, y: 0, scale: 1, pointerEvents: 'auto' }}
                exit={{
                  opacity: 0,
                  y: reducedMotion ? 0 : 8,
                  scale: reducedMotion ? 1 : 0.985,
                  pointerEvents: 'none',
                }}
              >
                <EntryForm
                  onPassword={() => {
                    setAuthenticated(true);
                    setScreen('upload');
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {authenticated && (
          <motion.div
            ref={uploadStage}
            className="upload-stage"
            data-active={screen === 'upload'}
            inert={screen !== 'upload'}
            tabIndex={-1}
            initial={false}
            animate={screen === 'upload' ? 'visible' : 'hidden'}
            variants={{
              visible: { opacity: 1, y: 0, display: 'block' },
              hidden: {
                opacity: 0,
                y: reducedMotion ? 0 : 8,
                transitionEnd: { display: 'none' },
              },
            }}
          >
            <div className="screen screen-upload">
              <Suspense
                fallback={
                  <div className="list-loading">
                    <LoaderCircle
                      size={18}
                      className="spinning"
                      aria-label="Loading uploads"
                    />
                  </div>
                }
              >
                <Uploads
                  maxFileBytes={maxFileBytes}
                  pendingFiles={pendingFiles}
                  onPendingReceived={receivedPending}
                  onUnauthorized={unauthorized}
                />
              </Suspense>
            </div>
          </motion.div>
        )}
      </main>
      {(preparing || selectionError || authError) && (
        <div
          className="selection-notice"
          role={selectionError || authError ? 'alert' : 'status'}
        >
          {preparing && <LoaderCircle size={16} className="spinning" />}
          <span>
            {preparing ? `preparing ${preparing}` : selectionError || authError}
          </span>
          {!preparing && (
            <button
              className="icon-button"
              aria-label="Dismiss selection error"
              onClick={() => {
                setSelectionError('');
                setAuthError('');
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}
      <AnimatePresence>
        {dragging && (
          <motion.div
            className="drag-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="drag-prompt"
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.96 }}
            >
              <ArrowUpFromLine size={44} strokeWidth={1.4} />
              <span>drop to upload</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
