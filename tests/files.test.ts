import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { Readable } from 'node:stream';
import { serve } from '@hono/node-server';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { Files } from '../server/files.js';
import { LocalStorage } from '../server/storage/local.js';
import type { FileRecord } from '../server/database.js';
import { hashPassword } from '../server/security.js';
import {
  downloadSchema,
  filesResponseSchema,
  type DropFile,
} from '../shared/files.js';

const passwordHash = hashPassword('test-password');

async function setup(
  storageFactory = (directory: string) =>
    new LocalStorage(join(directory, 'objects')),
) {
  const directory = await mkdtemp(join(tmpdir(), 'tg-drop-test-'));
  const config = readConfig({
    DATA_DIR: directory,
    STORAGE: 'local',
    ORIGIN: 'http://drop.test',
    PASSWORD_HASH: passwordHash,
    SESSION_SECRET: 'a'.repeat(64),
    MAX_FILE_BYTES: '4096',
    MAX_STAGING_BYTES: '16384',
  });
  const files = new Files(config, storageFactory(directory));
  await files.start();
  const server = serve({
    fetch: createApp(config, files, false).fetch,
    hostname: '127.0.0.1',
    port: 0,
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('missing server port');
  const origin = `http://127.0.0.1:${address.port}`;
  let cookie = '';
  async function request(path: string, options?: RequestInit) {
    return fetch(`${origin}/api${path}`, {
      ...options,
      headers: {
        Origin: config.ORIGIN,
        Cookie: cookie,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }
  async function login() {
    const response = await request('/session', {
      method: 'POST',
      body: JSON.stringify({ password: 'test-password' }),
    });
    assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    assert.ok(cookie);
    return response;
  }
  async function upload(name = 'sample.txt', contents = 'hello from drop') {
    const id = randomUUID();
    const response = await request('/files', {
      method: 'POST',
      headers: {
        'x-upload-id': id,
        'x-file-name': encodeURIComponent(name),
        'x-file-size': String(Buffer.byteLength(contents)),
        'Content-Type': 'text/plain',
      },
      body: contents,
    });
    assert.equal(response.status, 201, await response.text());
    await waitFor(() => files.db.get(id)?.status === 'ready');
    const file = files.list().find((file) => file.id === id);
    assert.ok(file);
    return file;
  }
  async function lookup(file: DropFile) {
    const response = await request('/lookup', {
      method: 'POST',
      body: JSON.stringify({
        code: file.code.toLowerCase().replaceAll('-', ' '),
      }),
    });
    assert.equal(response.status, 200);
    return downloadSchema.parse(await response.json());
  }
  async function close() {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await files.close();
    await rm(directory, { recursive: true, force: true });
  }
  return {
    directory,
    config,
    files,
    request,
    login,
    upload,
    lookup,
    close,
    origin,
  };
}

async function waitFor(condition: () => boolean) {
  for (let index = 0; index < 100; index++) {
    if (condition()) return;
    await setTimeout(20);
  }
  assert.fail('condition did not become true');
}

test('file list and upload require authentication, writes require the correct origin', async () => {
  const context = await setup();
  try {
    assert.equal((await context.request('/files')).status, 401);
    assert.equal(
      (await context.request('/files', { method: 'POST', body: 'private' }))
        .status,
      401,
    );
    assert.equal(
      (
        await context.request('/session', {
          method: 'POST',
          body: JSON.stringify({ password: 'wrong' }),
        })
      ).status,
      401,
    );
    const login = await context.login();
    assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/);
    assert.match(login.headers.get('set-cookie') ?? '', /SameSite=Strict/);
    assert.equal(
      (
        await context.request('/files', {
          method: 'POST',
          headers: { Origin: 'https://evil.test' },
        })
      ).status,
      403,
    );
    assert.equal((await context.request('/files')).status, 200);
  } finally {
    await context.close();
  }
});

test('file codes survive repeated downloads until manual deletion', async () => {
  const context = await setup();
  try {
    await context.login();
    const file = await context.upload('заметки.txt');
    const download = await context.lookup(file);
    const path = download.url.replace('/api', '');
    assert.equal((await context.request(path, { method: 'HEAD' })).status, 405);
    assert.equal(
      (await context.request(path, { headers: { 'Sec-Purpose': 'prefetch' } }))
        .status,
      403,
    );
    await context.lookup(file);
    const response = await context.request(path);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('content-disposition') ?? '',
      /filename\*=UTF-8''%D0/,
    );
    assert.equal(await response.text(), 'hello from drop');
    await context.lookup(file);
    assert.equal(await (await context.request(path)).text(), 'hello from drop');
    await context.request(`/files/${file.id}`, { method: 'DELETE' });
    assert.equal(
      (
        await context.request('/lookup', {
          method: 'POST',
          body: JSON.stringify({ code: file.code }),
        })
      ).status,
      404,
    );
    assert.equal((await context.request(path)).status, 404);
  } finally {
    await context.close();
  }
});

test('oversized uploads are rejected and deleting a file revokes existing grants', async () => {
  const context = await setup();
  try {
    await context.login();
    const oversized = await context.request('/files', {
      method: 'POST',
      headers: {
        'x-upload-id': randomUUID(),
        'x-file-name': 'large.bin',
        'x-file-size': '4097',
      },
      body: 'x',
    });
    assert.equal(oversized.status, 413);
    const file = await context.upload();
    const download = await context.lookup(file);
    assert.equal(
      (await context.request(`/files/${file.id}`, { method: 'DELETE' })).status,
      200,
    );
    assert.equal(
      (await context.request(download.url.replace('/api', ''))).status,
      404,
    );
    const response = filesResponseSchema.parse(
      await (await context.request('/files')).json(),
    );
    assert.equal(response.files.length, 0);
  } finally {
    await context.close();
  }
});

test('restart recovers queued uploads and removes abandoned partial files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tg-drop-recovery-'));
  const config = readConfig({
    DATA_DIR: directory,
    STORAGE: 'local',
    PASSWORD_HASH: passwordHash,
    SESSION_SECRET: 'a'.repeat(64),
  });
  const storage = new LocalStorage(join(directory, 'objects'));
  const files = new Files(config, storage);
  await files.start();
  const id = randomUUID();
  await writeFile(files.path(id), 'recovered');
  await writeFile(files.path('abandoned.part'), 'partial');
  files.db.insert({
    id,
    name: 'recovered.txt',
    size: 9,
    mime: 'text/plain',
    code: 'ABCD-EFGH-JKLM',
    createdAt: Date.now(),
    status: 'storing',
    storageKey: null,
  });
  await files.close();
  const restarted = new Files(config, storage);
  try {
    await restarted.start();
    await waitFor(() => restarted.db.get(id)?.status === 'ready');
    assert.deepEqual(await readdir(join(directory, 'staging')), []);
  } finally {
    await restarted.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('failed storage can be retried without uploading the browser file again', async () => {
  class FlakyStorage extends LocalStorage {
    attempts = 0;
    override async put(path: string, file: FileRecord) {
      if (++this.attempts === 1) throw new Error('temporary storage failure');
      return super.put(path, file);
    }
  }
  const context = await setup(
    (directory) => new FlakyStorage(join(directory, 'objects')),
  );
  try {
    await context.login();
    const id = randomUUID();
    const response = await context.request('/files', {
      method: 'POST',
      body: 'retry me',
      headers: {
        'x-upload-id': id,
        'x-file-name': 'retry.txt',
        'x-file-size': '8',
      },
    });
    assert.equal(response.status, 201);
    await waitFor(() => context.files.db.get(id)?.status === 'failed');
    assert.equal(context.files.list()[0]?.code, '');
    assert.equal(
      (await context.request(`/files/${id}/retry`, { method: 'POST' })).status,
      200,
    );
    await waitFor(() => context.files.db.get(id)?.status === 'ready');
    assert.ok(context.files.list()[0]?.code);
  } finally {
    await context.close();
  }
});

test('an interrupted download retains its code and releases active transfer tracking', async () => {
  class SlowStorage extends LocalStorage {
    override async open(key: string) {
      await setTimeout(80);
      const source = await super.open(key);
      const stream = Readable.from(
        (async function* () {
          for await (const chunk of source) {
            if (!(chunk instanceof Buffer)) throw new Error('unexpected chunk');
            for (let offset = 0; offset < chunk.length; offset += 128) {
              await setTimeout(20);
              yield chunk.subarray(offset, offset + 128);
            }
          }
        })(),
      );
      stream.once('close', () => source.destroy());
      return stream;
    }
  }
  const context = await setup(
    (directory) => new SlowStorage(join(directory, 'objects')),
  );
  try {
    await context.login();
    const file = await context.upload('interrupted.txt', 'x'.repeat(4096));
    const grant = await context.lookup(file);
    const beforeHeaders = new AbortController();
    const abandoned = fetch(context.origin + grant.url, {
      signal: beforeHeaders.signal,
    });
    await setTimeout(20);
    beforeHeaders.abort();
    await assert.rejects(
      abandoned,
      (error: unknown) => error instanceof Error && error.name === 'AbortError',
    );
    await setTimeout(100);
    const abort = new AbortController();
    const response = await fetch(context.origin + grant.url, {
      signal: abort.signal,
    });
    const reader = response.body?.getReader();
    assert.ok(reader);
    await reader.read();
    abort.abort();
    await reader.cancel().catch(() => {
      /* abort already cancelled the body. */
    });
    await setTimeout(50);
    await context.lookup(file);
    const retried = await context.request(grant.url.replace('/api', ''));
    assert.equal(retried.status, 200);
    assert.equal((await retried.text()).length, 4096);
    await context.lookup(file);
    assert.equal(context.files.db.get(file.id)?.status, 'ready');
    context.files.delete(file.id);
    await waitFor(() => context.files.db.get(file.id) === undefined);
  } finally {
    await context.close();
  }
});

test('manual removal revokes codes immediately and waits for active transfers before deleting data', async () => {
  const context = await setup();
  try {
    await context.login();
    const file = await context.upload();
    const [first, second] = await Promise.all([
      context.files.open(file.id),
      context.files.open(file.id),
    ]);
    context.files.delete(file.id);
    assert.throws(() => context.files.lookup(file.code), /Code not found/);
    first.stream.destroy();
    context.files.finishDownload(first.file);
    await context.files.collect();
    assert.equal(context.files.db.get(file.id)?.status, 'deleting');
    second.stream.destroy();
    context.files.finishDownload(second.file);
    await context.files.collect();
    assert.equal(context.files.db.get(file.id), undefined);
  } finally {
    await context.close();
  }
});
