export function shareUrl(code: string) {
  return new URL(`/${encodeURIComponent(code)}`, window.location.origin).href;
}
