import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

export async function question(label: string, hidden = false) {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const terminal = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  process.stdout.write(label);
  muted = hidden;
  const input = new AbortController();
  terminal.once('close', () => input.abort());
  try {
    return await terminal.question('', { signal: input.signal });
  } finally {
    terminal.close();
    if (hidden) process.stdout.write('\n');
  }
}
