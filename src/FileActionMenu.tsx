import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Menu from '@radix-ui/react-menu';
import {
  Check,
  Copy,
  Download,
  Ellipsis,
  Pencil,
  Share,
  Trash2,
} from 'lucide-react';
import { shareUrl } from './share-url';
import './ui/dropdown-menu.css';

export type FileMenuState = {
  open: boolean;
  point?: { x: number; y: number };
};

export function FileActionMenu({
  name,
  code,
  downloadUrl,
  busy,
  confirmDelete,
  edit,
  remove,
  resetConfirmation,
  control,
  className = 'row-action',
}: {
  name: string;
  code: string;
  downloadUrl?: string;
  busy: boolean;
  confirmDelete: boolean;
  edit: () => void;
  remove: () => boolean;
  resetConfirmation: () => void;
  control?: { state: FileMenuState; setState: (state: FileMenuState) => void };
  className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const editAfterClose = useRef(false);
  const [internalState, setInternalState] = useState<FileMenuState>({
    open: false,
  });
  const [container, setContainer] = useState<HTMLDialogElement | null>(null);
  const [feedback, setFeedback] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const state = control?.state ?? internalState;
  const setState = control?.setState ?? setInternalState;
  const { open, point } = state;
  const virtualAnchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          point
            ? new DOMRect(point.x, point.y, 0, 0)
            : (trigger.current?.getBoundingClientRect() ?? new DOMRect()),
      },
    }),
    [point],
  );

  function closeMenu() {
    setState({ ...state, open: false });
    resetConfirmation();
  }

  function openButton() {
    setContainer(trigger.current?.closest('dialog') ?? null);
    trigger.current?.focus({ preventScroll: true });
    setState({ open: true });
  }

  async function copy(kind: 'link' | 'code') {
    try {
      await navigator.clipboard.writeText(
        kind === 'link' ? shareUrl(code) : code,
      );
      setFeedback(kind === 'link' ? 'Link copied' : 'Code copied');
    } catch {
      setFeedback('Couldn’t copy to clipboard');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(''), 1800);
  }

  return (
    <Menu.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!next) closeMenu();
      }}
    >
      <Menu.Anchor virtualRef={virtualAnchor} />
      <button
        id={id}
        ref={trigger}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${name}`}
        title={feedback || 'File actions'}
        disabled={busy}
        onClick={() => {
          if (open) closeMenu();
          else openButton();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          openButton();
        }}
      >
        {feedback.endsWith('copied') ? (
          <Check size={17} aria-hidden="true" />
        ) : (
          <Ellipsis size={19} aria-hidden="true" />
        )}
      </button>
      <span className="visually-hidden" role="status">
        {feedback}
      </span>
      <Menu.Portal container={container}>
        <Menu.Content
          data-slot="dropdown-menu-content"
          className="file-command-menu"
          aria-labelledby={id}
          align={point ? 'start' : 'end'}
          sideOffset={point ? 0 : 5}
          collisionPadding={8}
          onInteractOutside={(event) => {
            if (
              event.target instanceof Node &&
              trigger.current?.contains(event.target)
            )
              event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            if (!editAfterClose.current) return;
            editAfterClose.current = false;
            event.preventDefault();
            trigger.current?.focus({ preventScroll: true });
            edit();
          }}
        >
          {downloadUrl && (
            <Menu.Item data-slot="dropdown-menu-item" asChild>
              <a href={downloadUrl} download className="file-menu-download">
                <Download size={15} aria-hidden="true" />
                download
              </a>
            </Menu.Item>
          )}
          <Menu.Item
            data-slot="dropdown-menu-item"
            onSelect={() => void copy('link')}
          >
            <Share size={15} aria-hidden="true" />
            share link
          </Menu.Item>
          <Menu.Item
            data-slot="dropdown-menu-item"
            onSelect={() => void copy('code')}
          >
            <Copy size={15} aria-hidden="true" />
            copy code
          </Menu.Item>
          <Menu.Item
            data-slot="dropdown-menu-item"
            onSelect={() => {
              editAfterClose.current = true;
            }}
          >
            <Pencil size={15} aria-hidden="true" />
            edit code
          </Menu.Item>
          <Menu.Separator className="file-command-separator" />
          <Menu.Item
            data-slot="dropdown-menu-item"
            data-variant="destructive"
            onSelect={(event) => {
              if (!remove()) event.preventDefault();
            }}
          >
            {confirmDelete ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Trash2 size={15} aria-hidden="true" />
            )}
            {confirmDelete ? 'confirm delete' : 'delete file'}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
