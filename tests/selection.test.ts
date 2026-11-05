import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFile } from '../src/selection.js';
import { formatSize } from '../shared/files.js';

test('file selection rejects empty, oversized and unreadable files before upload', async () => {
  await assert.rejects(
    validateFile(new File([], 'empty.txt'), 100),
    /Empty files/,
  );
  await assert.rejects(
    validateFile(new File(['too large'], 'large.bin'), 3),
    /Maximum file size/,
  );
  class UnreadableFile extends File {
    override slice(): Blob {
      throw new Error('not a regular file');
    }
  }
  await assert.rejects(
    validateFile(new UnreadableFile(['x'], 'folder'), 100),
    /cannot be read/,
  );
  await assert.doesNotReject(
    validateFile(new File(['valid'], 'anything.unknown'), 100),
  );
});

test('file size numbers and units cannot wrap separately', () => {
  assert.equal(formatSize(18), '18\u00a0B');
  assert.equal(formatSize(1_500_000), '1.5\u00a0MB');
  assert.equal(formatSize(4_000_000_000), '4\u00a0GB');
});
