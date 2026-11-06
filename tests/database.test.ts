import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { FileDatabase } from '../server/database.js';

test('migration preserves files, replaces legacy codes and keeps new codes stable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tg-drop-migration-'));
  const legacy = new Database(join(directory, 'files.db'));
  legacy.exec(`CREATE TABLE files (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL,
    mime TEXT NOT NULL, code TEXT NOT NULL UNIQUE, expiration TEXT NOT NULL,
    expiresAt INTEGER, createdAt INTEGER NOT NULL, status TEXT NOT NULL,
    storageKey TEXT
  ); CREATE INDEX files_expiry ON files(expiresAt);`);
  legacy
    .prepare('INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      'existing-file',
      'notes.txt',
      10,
      'text/plain',
      'ABCD-EFGH-JKLM',
      '3days',
      1,
      1,
      'ready',
      'message-id',
    );
  legacy.close();
  const migrated = new FileDatabase(directory);
  try {
    const file = migrated.get('existing-file');
    assert.equal(file?.id, 'existing-file');
    assert.equal(file?.storageKey, 'message-id');
    assert.equal(file?.status, 'ready');
    assert.ok(file);
    assert.equal(file.code.replaceAll('-', '').length, 16);
    assert.equal(migrated.byCode('ABCD-EFGH-JKLM'), undefined);
    migrated.update(file.id, { width: 1920, height: 1080 });
    const reopened = new FileDatabase(directory);
    try {
      assert.equal(reopened.get(file.id)?.code, file.code);
      assert.equal(reopened.get(file.id)?.width, 1920);
      assert.equal(reopened.get(file.id)?.height, 1080);
    } finally {
      reopened.close();
    }
    assert.equal('expiration' in (file ?? {}), false);
    assert.equal('expiresAt' in (file ?? {}), false);
    assert.deepEqual(migrated.garbage(), []);
  } finally {
    migrated.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('sessions persist across database restarts until explicitly revoked', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tg-drop-sessions-'));
  const initial = new FileDatabase(directory);
  initial.createSession('session-digest');
  initial.close();
  const reopened = new FileDatabase(directory);
  try {
    assert.equal(reopened.hasSession('session-digest'), true);
    assert.equal(reopened.hasSession('unknown'), false);
    reopened.deleteSession('session-digest');
    assert.equal(reopened.hasSession('session-digest'), false);
  } finally {
    reopened.close();
    await rm(directory, { recursive: true, force: true });
  }
});
