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
import { telegramKey } from '../server/telegram-chat.js';

const source = { id: -1000000000042, title: 'files', tagId: null };

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
  db.saveSettings({ sources: [source], tags: [] });
  const edits: { id: number; caption: TextWithEntities }[] = [];
  const port: TelegramSyncPort = {
    async *history() {},
    async read(_peerId, id) {
      const latest = edits.at(-1);
      return latest ? { ...file, id, caption: latest.caption } : null;
    },
    subscribe() {
      return () => {};
    },
    async edit(_peerId, id, caption) {
      edits.push({ id, caption });
    },
  };
  const sync = new TelegramSync(port, db);
  const file: SavedDocument = {
    peerId: source.id,
    id: 12,
    name: 'notes.txt',
    size: 42,
    mime: 'text/plain',
    createdAt: 1,
    caption: { text: 'my notes' },
  };
  try {
    await sync.import(file);
    const first = db.byStorageKey(telegramKey(source.id, 12));
    assert.ok(first);
    assert.equal(first.status, 'ready');
    assert.equal(first.name, 'notes.txt');
    const edited = edits[0];
    assert.ok(edited);
    await sync.import({ ...file, caption: edited.caption });
    assert.equal(db.list().length, 1);
    assert.equal(edits.length, 1);
    await sync.updateCode(telegramKey(source.id, file.id), first.code, 'VPN');
    await sync.updateCode(telegramKey(source.id, file.id), 'VPN', 'NOTES');
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
      sourceId: source.id,
    });
    await sync.import({
      ...file,
      id: 13,
      caption: { text: 'tg-drop · 12345678-1234-1234-1234-123456789abc' },
    });
    assert.equal(db.byStorageKey(telegramKey(source.id, 13))?.code, code);
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

test(
  're-sync imports missed messages, preserves codes and prunes only completed sources',
  { timeout: 5000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tg-drop-resync-'));
    const db = new FileDatabase(directory);
    const saved = { id: 123, title: 'saved messages', tagId: null };
    const ignored = { id: -1000000000099, title: 'other', tagId: null };
    db.saveSettings({ sources: [source, saved], tags: [] });
    const document = (peerId: number, id: number): SavedDocument => ({
      peerId,
      id,
      name: `${peerId}-${id}.txt`,
      mime: 'text/plain',
      size: 1,
      createdAt: 1,
      editable: false,
      caption: { text: '' },
    });
    let listener: ((file: SavedDocument) => void) | undefined;
    let scans = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sync = new TelegramSync(
      {
        async *history(peerId) {
          if (peerId === saved.id) throw new Error('history unavailable');
          scans++;
          await gate;
          yield document(peerId, 1);
          yield document(peerId, 3);
        },
        async read(peerId, id) {
          return document(peerId, id);
        },
        async edit() {},
        subscribe(callback) {
          listener = callback;
          return () => {
            listener = undefined;
          };
        },
      },
      db,
    );
    const key = (peerId: number, id: number) => telegramKey(peerId, id);
    try {
      await sync.import(document(source.id, 1));
      await sync.import(document(source.id, 2));
      await sync.import(document(saved.id, 2));
      const original = db.byStorageKey(key(source.id, 1));
      const deleted = db.byStorageKey(key(source.id, 2));
      sync.start();
      assert.equal(sync.resync().running, true);
      listener?.(document(ignored.id, 7));
      listener?.(document(saved.id, 4));
      release();
      for (
        let attempt = 0;
        attempt < 100 &&
        (sync.status.running || !db.byStorageKey(key(saved.id, 4)));
        attempt++
      ) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      assert.equal(sync.status.running, false);
      assert.ok(db.byStorageKey(key(saved.id, 4)));
      assert.equal(scans, 1);
      assert.match(sync.status.error ?? '', /saved messages/);
      assert.equal(db.byStorageKey(key(source.id, 1))?.code, original?.code);
      assert.ok(db.byStorageKey(key(source.id, 3)));
      assert.ok(db.byStorageKey(key(saved.id, 2)));
      assert.ok(deleted);
      assert.equal(db.byCode(deleted.code), undefined);
      assert.equal(db.byStorageKey(key(ignored.id, 7)), undefined);
    } finally {
      release();
      await sync.stop();
      db.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
