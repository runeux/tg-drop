export function HotkeyBadge({ children }: { children: string }) {
  return (
    <kbd className="hotkey-badge" aria-hidden="true">
      {children}
    </kbd>
  );
}
