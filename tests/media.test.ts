import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaKind, mediaType } from '../shared/media.js';
import { byteRange } from '../server/byte-range.js';
import { probeDimensions } from '../server/media-dimensions.js';

test('video and animated image dimensions are read before previews load', async () => {
  assert.deepEqual(
    await probeDimensions('tests/fixtures/gallery.mp4', {
      name: 'clip.mp4',
      mime: 'video/mp4',
    }),
    { width: 320, height: 180 },
  );
  assert.deepEqual(
    await probeDimensions('tests/fixtures/gallery.gif', {
      name: 'animation.gif',
      mime: 'image/gif',
    }),
    { width: 200, height: 100 },
  );
});

test('gallery classification includes media documents and leaves other files out', () => {
  for (const [name, mime, kind, type] of [
    ['photo.jpg', 'image/jpeg', 'image', 'image/jpeg'],
    ['animation.gif', 'image/gif', 'image', 'image/gif'],
    ['clip.mp4', 'video/mp4', 'video', 'video/mp4'],
    ['PHOTO.PNG', 'application/octet-stream', 'image', 'image/png'],
    ['clip.MOV', '', 'video', 'video/quicktime'],
    ['photo.heic', 'image/heic', 'image', 'image/heic'],
    ['image', 'IMAGE/WEBP; quality=80', 'image', 'image/webp'],
    ['notes.pdf', 'application/pdf', null, null],
    ['notes.txt', 'text/plain', null, null],
    ['script.jpg', 'text/html', null, null],
    ['archive.zip', 'application/octet-stream', null, null],
    ['constructor', 'application/octet-stream', null, null],
    ['__proto__', 'application/octet-stream', null, null],
  ] as const) {
    assert.equal(mediaKind({ name, mime }), kind);
    assert.equal(mediaType({ name, mime }), type);
  }
});

test('byte ranges handle seeks, suffixes and invalid ranges', () => {
  assert.deepEqual(byteRange('bytes=3-7', 10), { start: 3, end: 7 });
  assert.deepEqual(byteRange('bytes=3-', 10), { start: 3, end: 9 });
  assert.deepEqual(byteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(byteRange('bytes=0-99', 10), { start: 0, end: 9 });
  assert.deepEqual(byteRange('bytes=-99', 10), { start: 0, end: 9 });
  for (const value of [
    'bytes=10-',
    'bytes=5-3',
    'bytes=-0',
    'bytes=-',
    'bytes=0-1,3-4',
    'garbage',
    'bytes=999999999999999999999-',
    'bytes=-99999999999999999999',
  ]) {
    assert.throws(() => byteRange(value, 10), /Invalid byte range/);
  }
});
