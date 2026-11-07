import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileDatabase } from '../server/database.js';
import {
  captionWithCode,
  TelegramSync,
  type SavedDocument,
  type TelegramSyncPort,
} from '../server/telegram-sync.js';
import type { TextWithEntities } from '@mtcute/node';

const code = 'ABCD-EFGH-JKLM-NPQR';

test('caption migration replaces old codes instead of appending them', () => {
  const old = captionWithCode(
    {
      text: '🌙 notes',
      entities: [{ _: 'messageEntityBold', offset: 3, length: 5 }],
    },
    '2345-6789-ABCD',
  );
  const updated = captionWithCode(old, code);
  assert.equal(updated.text, `🌙 notes\n\n${code}`);
  assert.equal(updated.text.includes('2345-6789-ABCD'), false);
  assert.deepEqual(updated.entities?.[0], old.entities?.[0]);
  assert.deepEqual(updated.entities?.[1], {
    _: 'messageEntityCode',
    offset: 10,
    length: code.length,
  });
  assert.equal(captionWithCode(updated, code), updated);
});

test('code captions preserve original text and entities and use UTF-16 offsets', () => {
  const original: TextWithEntities = {
    text: '🌙 notes',
    entities: [{ _: 'messageEntityBold', offset: 3, length: 5 }],
  };
  const annotated = captionWithCode(original, code);
  assert.equal(annotated.text, `🌙 notes\n\n${code}`);
  assert.deepEqual(annotated.entities?.[0], original.entities?.[0]);
  assert.deepEqual(annotated.entities?.[1], {
    _: 'messageEntityCode',
    offset: 10,
    length: code.length,
  });
  assert.equal(captionWithCode(annotated, code), annotated);
});

test('channel import is idempotent and app-owned messages reuse the existing code', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tg-drop-sync-'));
  const db = new FileDatabase(directory);
  const edits: { id: number; caption: TextWithEntities }[] = [];
  const port: TelegramSyncPort = {
    async *history() {},
    async read(id) {
      const latest = edits.at(-1);
      return latest ? { ...file, id, caption: latest.caption } : null;
    },
    subscribe() {
      return () => {};
    },
    async edit(id, caption) {
      edits.push({ id, caption });
    },
  };
  const sync = new TelegramSync(port, db);
  const file: SavedDocument = {
    id: 12,
    name: 'notes.txt',
    size: 42,
    mime: 'text/plain',
    createdAt: 1,
    caption: { text: 'my notes' },
  };
  try {
    await sync.import(file);
    const first = db.byStorageKey('12');
    assert.ok(first);
    assert.equal(first.status, 'ready');
    assert.equal(first.name, 'notes.txt');
    const edited = edits[0];
    assert.ok(edited);
    await sync.import({ ...file, caption: edited.caption });
    assert.equal(db.list().length, 1);
    assert.equal(edits.length, 1);
    await sync.updateCode(file.id, first.code, 'VPN');
    await sync.updateCode(file.id, 'VPN', 'NOTES');
    assert.equal(edits.at(-1)?.caption.text, 'my notes\n\nNOTES');
    db.insert({
      id: '12345678-1234-1234-1234-123456789abc',
      name: 'app.txt',
      size: 7,
      mime: 'text/plain',
      code,
      createdAt: 2,
      status: 'storing',
      storageKey: null,
    });
    await sync.import({
      ...file,
      id: 13,
      caption: { text: 'tg-drop · 12345678-1234-1234-1234-123456789abc' },
    });
    assert.equal(db.byStorageKey('13')?.code, code);
    assert.equal(db.list().length, 2);
    assert.equal(
      edits.at(-1)?.caption.entities?.at(-1)?._,
      'messageEntityCode',
    );
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
