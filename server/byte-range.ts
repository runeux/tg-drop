import { HttpError } from './errors.js';
import type { ByteRange } from './storage/types.js';

export function byteRange(header: string, size: number): ByteRange {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]))
    throw new HttpError(416, 'Invalid byte range.');
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  const start = first ?? Math.max(0, size - (last ?? 0));
  const end =
    first === undefined ? size - 1 : Math.min(last ?? size - 1, size - 1);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    (last !== undefined && !Number.isSafeInteger(last)) ||
    start > end ||
    start >= size
  )
    throw new HttpError(416, 'Invalid byte range.');
  return { start, end };
}
