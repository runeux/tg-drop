import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { telegramClient, TelegramStorage } from '../server/storage/telegram.js';
import { telegramKey } from '../server/telegram-chat.js';
import type { FileRecord } from '../server/database.js';
import { Long, Message, PeersIndex } from '@mtcute/node';
import { telegramSyncPort } from '../server/telegram-sync.js';

const channelId = -1000000000042;
const savedId = 123;

test('uploads, downloads and removal use the source from the file location', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'tg-drop-channel-'));
  const client = telegramClient({
    TG_API_ID: 1,
    TG_API_HASH: '0'.repeat(32),
    DATA_DIR: directory,
  });
  const storage = new TelegramStorage(client);
  const file: FileRecord = {
    id: '12345678-1234-1234-1234-123456789abc',
    name: 'test.txt',
    size: 1,
    mime: 'text/plain',
    code: 'ABCD-EFGH-JKLM-NPQR',
    createdAt: 1,
    status: 'storing',
    storageKey: null,
    sourceId: channelId,
  };
  const sent = new Error('upload reached channel');
  const search = t.mock.method(client, 'searchMessages', async () => []);
  const send = t.mock.method(client, 'sendMedia', async () => {
    throw sent;
  });
  const get = t.mock.method(client, 'getMessages', async () => [null]);
  const remove = t.mock.method(client, 'deleteMessages', async () => {});
  try {
    await assert.rejects(
      storage.put('/test.txt', file, () => {}),
      sent,
    );
    assert.equal(search.mock.calls[0]?.arguments[0]?.chatId, channelId);
    assert.equal(send.mock.calls[0]?.arguments[0], channelId);
    await assert.rejects(
      storage.open(telegramKey(savedId, 12)),
      /stored file is unavailable/,
    );
    await storage.remove(telegramKey(channelId, 12));
    assert.equal(get.mock.calls.length, 2);
    assert.equal(get.mock.calls[0]?.arguments[0], savedId);
    assert.equal(get.mock.calls[1]?.arguments[0], channelId);
    for (const call of get.mock.calls) {
      assert.equal(call.arguments[1], 12);
    }
    assert.equal(remove.mock.calls.length, 0);
  } finally {
    await storage.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('history and live events keep channel and saved messages separate', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'tg-drop-channel-sync-'));
  const client = telegramClient({
    TG_API_ID: 1,
    TG_API_HASH: '0'.repeat(32),
    DATA_DIR: directory,
  });
  const peers = PeersIndex.from({
    users: [{ _: 'user', id: 123, self: true, firstName: 'test' }],
    chats: [
      {
        _: 'channelForbidden',
        id: 42,
        accessHash: Long.ZERO,
        title: 'files',
        broadcast: true,
      },
    ],
  });
  const message = (channel: boolean) =>
    new Message(
      {
        _: 'message',
        id: 12,
        peerId: channel
          ? { _: 'peerChannel', channelId: 42 }
          : { _: 'peerUser', userId: 123 },
        date: 1,
        message: 'notes',
        media: {
          _: 'messageMediaDocument',
          document: {
            _: 'document',
            id: Long.ONE,
            accessHash: Long.ZERO,
            fileReference: new Uint8Array(),
            date: 1,
            mimeType: 'text/plain',
            size: 42,
            dcId: 1,
            attributes: [
              { _: 'documentAttributeFilename', fileName: 'notes.txt' },
            ],
          },
        },
      },
      peers,
    );
  const saved = message(false);
  const channel = message(true);
  const history = t.mock.method(client, 'iterHistory', async function* () {
    yield saved;
    yield channel;
  });
  const subscribe = t.mock.method(client.onNewMessage, 'add', () => {});
  const unsubscribe = t.mock.method(client.onNewMessage, 'remove', () => {});
  const edit = t.mock.method(client, 'editMessage', async () => channel);
  const port = telegramSyncPort(client);
  try {
    const files = [];
    for await (const file of port.history(channelId)) files.push(file);
    assert.equal(history.mock.calls[0]?.arguments[0], channelId);
    assert.equal(files.length, 1);
    assert.equal(files[0]?.name, 'notes.txt');
    const live: number[] = [];
    const stop = port.subscribe((file) => live.push(file.peerId));
    const listener = subscribe.mock.calls[0]?.arguments[0];
    assert.ok(listener);
    listener(saved);
    listener(channel);
    assert.deepEqual(live, [savedId, channelId]);
    stop();
    assert.equal(unsubscribe.mock.calls.length, 1);
    await port.edit(channelId, 12, { text: 'code' });
    const request = edit.mock.calls[0]?.arguments[0];
    assert.ok(request && 'chatId' in request);
    assert.equal(request.chatId, channelId);
  } finally {
    await client.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});
