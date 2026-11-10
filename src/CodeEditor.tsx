import { useRef, useState } from 'react';
import { motion, useAnimate, useReducedMotion } from 'motion/react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
  const [open, setOpen] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const [form, animate] = useAnimate<HTMLFormElement>();
  const reducedMotion = useReducedMotion();
  const [value, setValue] = useState(file.code);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await save(value);
      setOpen(false);
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
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (busy) details.cancel();
        else setOpen(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        className="code-editor"
        closeLabel="Close code editor"
        initialFocus={input}
      >
        <DialogHeader className="code-editor-heading">
          <DialogTitle>edit code</DialogTitle>
        </DialogHeader>
        <form
          ref={form}
          className={`code-editor-form ${error ? 'has-error' : ''}`}
          onSubmit={(event) => void submit(event)}
        >
          <Input
            ref={input}
            onFocus={(event) => event.currentTarget.select()}
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
      </DialogContent>
    </Dialog>
  );
}
