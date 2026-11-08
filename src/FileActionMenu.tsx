import { useRef } from 'react';
import { Check, Copy, Download, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function FileActionMenu({
  name,
  downloadUrl,
  busy,
  copied,
  confirmDelete,
  copy,
  edit,
  remove,
  resetConfirmation,
}: {
  name: string;
  downloadUrl: string;
  busy: boolean;
  copied: boolean;
  confirmDelete: boolean;
  copy: () => void;
  edit: () => void;
  remove: () => boolean;
  resetConfirmation: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const editAfterClose = useRef(false);

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (!open) resetConfirmation();
      }}
    >
      <DropdownMenuTrigger
        ref={trigger}
        className="row-action file-action-menu-trigger"
        aria-label={`Actions for ${name}`}
        disabled={busy}
      >
        <Ellipsis size={20} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (!editAfterClose.current) return;
          editAfterClose.current = false;
          event.preventDefault();
          trigger.current?.focus();
          edit();
        }}
      >
        <DropdownMenuItem asChild>
          <a href={downloadUrl} download className="file-menu-download">
            <Download size={16} aria-hidden="true" />
            download
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copy}>
          {copied ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
          copy code
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            editAfterClose.current = true;
          }}
        >
          <Pencil size={16} aria-hidden="true" />
          edit code
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={(event) => {
            if (!remove()) event.preventDefault();
          }}
        >
          {confirmDelete ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Trash2 size={16} aria-hidden="true" />
          )}
          {confirmDelete ? 'confirm delete' : 'delete file'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
