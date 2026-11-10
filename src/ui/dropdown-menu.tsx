import type { ComponentProps } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import './dropdown-menu.css';

// shadcn/ui's new york dropdown menu, styled with the app's css.
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  sideOffset = 4,
  inline = false,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  inline?: boolean;
}) {
  const content = (
    <DropdownMenuPrimitive.Content
      data-slot="dropdown-menu-content"
      sideOffset={sideOffset}
      {...props}
    />
  );
  return inline ? (
    content
  ) : (
    <DropdownMenuPrimitive.Portal>{content}</DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  variant = 'default',
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: 'default' | 'destructive';
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      {...props}
    />
  );
}

export const DropdownMenuCheckboxItem = DropdownMenuPrimitive.CheckboxItem;
