import { useEffect, useRef, useState } from 'react';
import { motion, useAnimate, useReducedMotion } from 'motion/react';
import { ArrowRight, LoaderCircle, X } from 'lucide-react';
import type { DropFile } from '../shared/files';
import { message } from './api';
import './code-editor.css';

export function CodeEditor({
  file,
  close,
  save,
}: {
  file: DropFile;
  close: () => void;
  save: (code: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [form, animate] = useAnimate<HTMLFormElement>();
  const reducedMotion = useReducedMotion();
  const [value, setValue] = useState(file.code);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    input.current?.focus();
    input.current?.select();
    return () => element?.close();
  }, []);

  function dismiss() {
    dialog.current?.close();
    close();
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await save(value);
      dismiss();
    } catch (error) {
      setError(message(error));
      input.current?.focus();
      if (!reducedMotion && form.current)
        void animate(
          form.current,
          { x: [0, -7, 6, -4, 2, 0] },
          { duration: 0.3 },
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="code-editor"
      aria-labelledby="code-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) dismiss();
      }}
    >
      <div className="code-editor-heading">
        <h2 id="code-editor-title">edit code</h2>
        <button
          className="row-action"
          type="button"
          aria-label="Close code editor"
          onClick={dismiss}
          disabled={busy}
        >
          <X size={18} />
        </button>
      </div>
      <form
        ref={form}
        className={`code-editor-form ${error ? 'has-error' : ''}`}
        onSubmit={(event) => void submit(event)}
      >
        <input
          ref={input}
          aria-label="Custom code"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'code-editor-error' : undefined}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="custom code"
          value={value}
          readOnly={busy}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
        />
        <motion.button
          className="code-submit"
          type="submit"
          aria-label="Save code"
          disabled={busy}
          whileTap={{ scale: 0.95 }}
        >
          {busy ? (
            <LoaderCircle size={16} className="spinning" />
          ) : (
            <ArrowRight size={18} />
          )}
        </motion.button>
      </form>
      {error && (
        <p id="code-editor-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
