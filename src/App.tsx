import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  LoaderCircle,
} from 'lucide-react';
import { api, sessionSchema } from './api';
import { EntryForm } from './EntryForm';

const Uploads = lazy(() => import('./Uploads'));

type Screen = 'home' | 'password' | 'upload' | 'download';

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [authenticated, setAuthenticated] = useState(false);
  const [maxFileBytes, setMaxFileBytes] = useState(2_000_000_000);
  const [dragging, setDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const dragDepth = useRef(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    void api('/session', sessionSchema)
      .then((session) => {
        setAuthenticated(session.authenticated);
        setMaxFileBytes(session.maxFileBytes);
      })
      .catch(() => {
        /* the form reports a connection error when used. */
      });
  }, []);

  const acceptFiles = useCallback(
    (files: File[]) => {
      setPendingFiles((pending) => [...pending, ...files]);
      setScreen(authenticated ? 'upload' : 'password');
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
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) acceptFiles(files);
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
  }, [acceptFiles]);

  const back = () => {
    setScreen('home');
    setPendingFiles([]);
  };
  const receivedPending = useCallback(() => setPendingFiles([]), []);
  const unauthorized = useCallback(() => {
    setAuthenticated(false);
    setScreen('password');
  }, []);

  return (
    <>
      <main className={screen === 'upload' ? 'app workspace' : 'app centered'}>
        <AnimatePresence initial={false}>
          {screen !== 'home' && (
            <motion.button
              className="back icon-button"
              aria-label="Back"
              onClick={back}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ArrowLeft size={21} />
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false} mode="popLayout">
          {screen !== 'upload' && (
            <motion.div
              className={`screen screen-${screen}`}
              key={screen}
              initial={{
                opacity: 0,
                y: reducedMotion ? 0 : 8,
                scale: reducedMotion ? 1 : 0.985,
              }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reducedMotion ? 0 : -5 }}
            >
              {screen === 'home' && (
                <div className="choices">
                  <motion.button
                    className="choice"
                    whileTap={{ scale: 0.975 }}
                    onClick={() =>
                      setScreen(authenticated ? 'upload' : 'password')
                    }
                  >
                    <span className="choice-icon">
                      <ArrowUpFromLine strokeWidth={1.35} />
                    </span>
                    <span>upload</span>
                  </motion.button>
                  <motion.button
                    className="choice"
                    whileTap={{ scale: 0.975 }}
                    onClick={() => setScreen('download')}
                  >
                    <span className="choice-icon">
                      <ArrowDownToLine strokeWidth={1.35} />
                    </span>
                    <span>download</span>
                  </motion.button>
                </div>
              )}
              {screen === 'password' && (
                <EntryForm
                  kind="password"
                  onPassword={() => {
                    setAuthenticated(true);
                    setScreen('upload');
                  }}
                />
              )}
              {screen === 'download' && <EntryForm kind="code" />}
            </motion.div>
          )}
        </AnimatePresence>
        {authenticated && (
          <motion.div
            className="screen screen-upload"
            hidden={screen !== 'upload'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
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
          </motion.div>
        )}
      </main>
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
