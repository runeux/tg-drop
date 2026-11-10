import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  RiCheckLine,
  RiDeleteBinLine,
  RiDownloadLine,
  RiEditLine,
  RiFileCopyLine,
  RiMoreLine,
  RiShareLine,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { shareUrl } from './share-url';

export function FileActionMenu({
  name,
  code,
  downloadUrl,
  busy,
  confirmDelete,
  edit,
  remove,
  resetConfirmation,
  renderRow,
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
  renderRow?: (trigger: ReactNode) => ReactNode;
  className?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const editAfterClose = useRef(false);
  const [feedback, setFeedback] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function finishClose(open: boolean) {
    if (open || !editAfterClose.current) return;
    editAfterClose.current = false;
    trigger.current?.focus({ preventScroll: true });
    edit();
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

  function items(context = false) {
    const Item = context ? ContextMenuItem : DropdownMenuItem;
    const Group = context ? ContextMenuGroup : DropdownMenuGroup;
    const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator;
    return (
      <>
        <Group>
          {downloadUrl && (
            <Item render={<a href={downloadUrl} download />}>
              <RiDownloadLine aria-hidden="true" /> download
            </Item>
          )}
          <Item onClick={() => void copy('link')}>
            <RiShareLine aria-hidden="true" /> share link
          </Item>
          <Item onClick={() => void copy('code')}>
            <RiFileCopyLine aria-hidden="true" /> copy code
          </Item>
          <Item
            onClick={() => {
              editAfterClose.current = true;
            }}
          >
            <RiEditLine aria-hidden="true" /> edit code
          </Item>
        </Group>
        <Separator />
        <Group>
          <Item
            variant="destructive"
            closeOnClick={confirmDelete}
            onClick={remove}
          >
            {confirmDelete ? (
              <RiCheckLine aria-hidden="true" />
            ) : (
              <RiDeleteBinLine aria-hidden="true" />
            )}
            {confirmDelete ? 'confirm delete' : 'delete file'}
          </Item>
        </Group>
      </>
    );
  }

  const menu = (
    <>
      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (!open) resetConfirmation();
        }}
        onOpenChangeComplete={finishClose}
      >
        <DropdownMenuTrigger
          render={
            <Button
              ref={trigger}
              variant="ghost"
              size="icon"
              className={className}
            />
          }
          aria-label={`Actions for ${name}`}
          title={feedback || 'File actions'}
          disabled={busy}
        >
          {feedback.endsWith('copied') ? (
            <RiCheckLine aria-hidden="true" />
          ) : (
            <RiMoreLine aria-hidden="true" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="w-auto min-w-44"
        >
          {items()}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="visually-hidden" role="status">
        {feedback}
      </span>
    </>
  );
  if (!renderRow) return menu;
  return (
    <ContextMenu
      onOpenChange={(open, details) => {
        if (open && busy) details.cancel();
        if (!open) resetConfirmation();
      }}
      onOpenChangeComplete={finishClose}
    >
      {renderRow(menu)}
      <ContextMenuContent className="min-w-44">
        {items(true)}
      </ContextMenuContent>
    </ContextMenu>
  );
}
