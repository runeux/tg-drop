import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { FileDatabase } from '../server/database.js';
import { Files } from '../server/files.js';
import { hashPassword } from '../server/security.js';
import { LocalStorage } from '../server/storage/local.js';
import { downloadSchema, filesResponseSchema } from '../shared/files.js';
import { workspaceSettingsSchema, type Tag } from '../shared/settings.js';

test('settings require sign-in, persist sources and scope file access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tg-drop-settings-'));
  const id = randomUUID();
  const legacyId = -1004304384450;
  const code = 'ABCD-EFGH-JKLM-NPQR';
  const legacy = new FileDatabase(directory);
  legacy.insert({
    id,
    code,
    name: 'legacy.txt',
    size: 10,
    mime: 'text/plain',
    createdAt: 1,
    status: 'ready',
    storageKey: '42',
  });
  legacy.close();
  const config = readConfig({
    DATA_DIR: directory,
    STORAGE: 'telegram',
    TG_API_ID: '1',
    TG_API_HASH: '0'.repeat(32),
    ORIGIN: 'http://drop.test',
    PASSWORD_HASH: hashPassword('test-password'),
    SESSION_SECRET: 'a'.repeat(64),
  });
  const files = new Files(config, new LocalStorage(join(directory, 'objects')));
  const syncCalls: (number[] | undefined)[] = [];
  const status = { running: false, error: null };
  const app = createApp(config, files, false, {
    async chats() {
      return [
        { id: 123, title: 'saved messages' },
        { id: legacyId, title: 'legacy channel' },
      ];
    },
    sync: {
      status,
      resync(sourceIds) {
        syncCalls.push(sourceIds);
        return { ...status, running: true };
      },
      async updateCode() {},
    },
  });

  let cookie = '';
  const request = (path: string, method = 'GET', data?: unknown) =>
    app.request(`${config.ORIGIN}/api${path}`, {
      method,
      headers: {
        Origin: config.ORIGIN,
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  const tag: Tag = { id: randomUUID(), label: 'crypto', color: 'amber' };
  const legacySource = { id: legacyId, tagId: tag.id };
  const savedSource = { id: 123, tagId: null };
  const settings = (sources: { id: number; tagId: string | null }[]) => ({
    sources,
    tags: [tag],
  });

  try {
    assert.equal((await request('/settings')).status, 401);
    assert.equal((await request('/settings/chats')).status, 401);
    assert.equal(
      (await request('/settings', 'PUT', settings([savedSource]))).status,
      401,
    );
    assert.equal((await request('/settings/sync', 'POST')).status, 401);
    const login = await request('/session', 'POST', {
      password: 'test-password',
    });
    cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    assert.ok(cookie);
    const current = workspaceSettingsSchema.parse(
      await (await request('/settings')).json(),
    );
    assert.deepEqual(current.sources, []);
    assert.equal((await request('/settings/sync', 'POST')).status, 409);
    assert.equal((await request('/lookup', 'POST', { code })).status, 404);
    assert.equal((await request('/settings', 'PUT', settings([]))).status, 400);
    assert.equal(
      (await request('/settings', 'PUT', settings([{ id: 456, tagId: null }])))
        .status,
      400,
    );
    assert.equal(
      (await request('/settings', 'PUT', settings([savedSource, savedSource])))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          '/settings',
          'PUT',
          settings([{ ...savedSource, tagId: randomUUID() }]),
        )
      ).status,
      400,
    );
    assert.equal(
      (await request('/settings', 'PUT', settings([legacySource, savedSource])))
        .status,
      200,
    );

    const result = filesResponseSchema.parse(
      await (await request('/files')).json(),
    );
    assert.deepEqual(
      result.files.map((file) => ({
        id: file.id,
        tag: file.tag,
        code: file.code,
      })),
      [{ id, tag, code }],
    );
    assert.equal(files.db.get(id)?.storageKey, `${legacyId}:42`);
    const download = await request('/lookup', 'POST', { code });
    assert.equal(download.status, 200);
    const link = downloadSchema.parse(await download.json()).url;
    assert.equal((await request('/settings/sync', 'POST')).status, 202);
    assert.deepEqual(syncCalls, [[legacyId, 123], undefined]);
    const pendingId = randomUUID();
    files.db.insert({
      id: pendingId,
      code: 'PENDING',
      name: 'pending.txt',
      size: 10,
      mime: 'text/plain',
      createdAt: 2,
      status: 'failed',
      storageKey: null,
      sourceId: legacyId,
    });
    assert.equal(
      (await request('/settings', 'PUT', settings([savedSource]))).status,
      409,
    );
    files.db.remove(pendingId);
    assert.equal(
      (await request('/settings', 'PUT', settings([savedSource]))).status,
      200,
    );
    assert.equal((await request('/lookup', 'POST', { code })).status, 404);
    assert.equal((await app.request(`${config.ORIGIN}${link}`)).status, 404);
    assert.equal((await request(`/files/${id}`, 'DELETE')).status, 404);
    assert.equal(files.db.get(id)?.status, 'ready');

    const reopened = new FileDatabase(directory);
    try {
      assert.deepEqual(reopened.readSettings(), {
        tags: [tag],
        sources: [{ ...savedSource, title: 'saved messages' }],
      });
    } finally {
      reopened.close();
    }
  } finally {
    await files.close();
    await rm(directory, { recursive: true, force: true });
  }
});
