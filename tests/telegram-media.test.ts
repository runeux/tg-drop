import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Emitter } from '@fuman/utils';
import { Long, Message, PeersIndex, type tl } from '@mtcute/node';
import {
  TelegramSync,
  telegramSyncPort,
  type SavedDocument,
} from '../server/telegram-sync.js';
import { FileDatabase } from '../server/database.js';
import { TelegramStorage } from '../server/storage/telegram.js';
import { TELEGRAM_CHAT_ID } from '../server/telegram-chat.js';

const channelId = -TELEGRAM_CHAT_ID - 1_000_000_000_000;
const peers = PeersIndex.from({
  chats: [
    {
      _: 'channelForbidden',
      id: channelId,
      accessHash: Long.ZERO,
      title: 'storage',
    },
  ],
});

function message(id: number, media?: tl.TypeMessageMedia, grouped = false) {
  return new Message(
    {
      _: 'message',
      id,
      peerId: { _: 'peerChannel', channelId },
      date: 1,
      message: 'caption',
      media,
      groupedId: grouped ? Long.ONE : undefined,
    },
    peers,
  );
}

function photo(progressive: boolean): tl.TypeMessageMedia {
  return {
    _: 'messageMediaPhoto',
    photo: {
      _: 'photo',
      id: Long.ONE,
      accessHash: Long.ZERO,
      fileReference: new Uint8Array(),
      date: 1,
      dcId: 2,
      sizes: [
        { _: 'photoSize', type: 's', w: 100, h: 100, size: 50 },
        progressive
          ? {
              _: 'photoSizeProgressive',
              type: 'y',
              w: 1280,
              h: 720,
              sizes: [100, 200, 300],
            }
          : { _: 'photoSize', type: 'y', w: 1280, h: 720, size: 300 },
      ],
    },
  };
}

function video(name?: string, mime = 'video/mp4'): tl.TypeMessageMedia {
  return {
    _: 'messageMediaDocument',
    document: {
      _: 'document',
      id: Long.ONE,
      accessHash: Long.ZERO,
      fileReference: new Uint8Array(),
      date: 1,
      dcId: 2,
      size: 400,
      mimeType: mime,
      attributes: [
        { _: 'documentAttributeVideo', w: 1280, h: 720, duration: 2 },
        ...(name
          ? [{ _: 'documentAttributeFilename' as const, fileName: name }]
          : []),
      ],
    },
  };
}

test('history and live sync accept album photos and videos with correct metadata', async () => {
  const messages = [
    message(1, photo(false), true),
    message(2, photo(true), true),
    message(3, video('holiday.mp4'), true),
    message(4, video()),
    message(5, video(undefined, 'video/webm')),
    message(6),
  ];
  const events = new Emitter<Message>();
  const port = telegramSyncPort({
    async getMessages() {
      throw new Error('unexpected lookup');
    },
    downloadAsNodeStream() {
      throw new Error('unexpected download');
    },
    async *iterHistory(chat) {
      assert.equal(chat, TELEGRAM_CHAT_ID);
      yield* messages;
    },
    onNewMessage: events,
    async editMessage() {
      throw new Error('unexpected edit');
    },
  });
  const history = [];
  for await (const file of port.history()) history.push(file);
  assert.deepEqual(
    history.slice(0, 5).map(({ width, height }) => [width, height]),
    Array.from({ length: 5 }, () => [1280, 720]),
  );
  assert.deepEqual(
    history.map(({ name, mime, size }) => ({ name, mime, size })),
    [
      { name: 'photo-1.jpg', mime: 'image/jpeg', size: 300 },
      { name: 'photo-2.jpg', mime: 'image/jpeg', size: 300 },
      { name: 'holiday.mp4', mime: 'video/mp4', size: 400 },
      { name: 'video-4.mp4', mime: 'video/mp4', size: 400 },
      { name: 'video-5.webm', mime: 'video/webm', size: 400 },
    ],
  );
  const live: SavedDocument[] = [];
  const unsubscribe = port.subscribe((file) => live.push(file));
  for (const item of messages) events.emit(item);
  assert.deepEqual(live, history);
  unsubscribe();
  events.emit(message(7, photo(false)));
  assert.equal(live.length, history.length);

  const directory = await mkdtemp(join(tmpdir(), 'tg-drop-media-'));
  const db = new FileDatabase(directory);
  const sync = new TelegramSync({ ...port, async edit() {} }, db);
  try {
    for (const file of history) await sync.import(file);
    const records = db.list();
    assert.equal(records.length, 5);
    assert.equal(new Set(records.map((file) => file.code)).size, 5);
    for (const file of live) await sync.import(file);
    assert.deepEqual(db.list(), records);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('storage streams photos and videos and rejects unavailable media', async () => {
  for (const media of [photo(false), photo(true), video(), undefined]) {
    const stored = message(1, media);
    const bytes = Buffer.from('media bytes'.repeat(1000));
    let offset: number | undefined;
    let source: Readable | undefined;
    const storage = new TelegramStorage({
      async getMessages(chat, id) {
        assert.equal(chat, TELEGRAM_CHAT_ID);
        assert.equal(id, 1);
        return [stored];
      },
      downloadAsNodeStream(location, params) {
        assert.equal(location, stored.media);
        offset = params?.offset;
        source = Readable.from([bytes.subarray(offset ?? 0)]);
        return source;
      },
      async searchMessages() {
        throw new Error('unexpected search');
      },
      async editMessage() {
        throw new Error('unexpected edit');
      },
      async sendMedia() {
        throw new Error('unexpected upload');
      },
      async deleteMessages() {
        throw new Error('unexpected delete');
      },
      async destroy() {},
    });
    if (!media) {
      await assert.rejects(storage.open('1'), /stored file is unavailable/);
      continue;
    }
    const stream = await storage.open('1');
    assert.equal(
      Buffer.concat(await stream.toArray()).toString(),
      bytes.toString(),
    );
    const partial = await storage.open('1', { start: 4099, end: 4105 });
    assert.equal(offset, 4096);
    assert.deepEqual(
      Buffer.concat(await partial.toArray()),
      bytes.subarray(4099, 4106),
    );
    assert.equal(source?.destroyed, true);
    const cancelled = await storage.open('1', { start: 0, end: 3 });
    cancelled.destroy();
    await new Promise<void>((resolve) => cancelled.once('close', resolve));
    assert.equal(source?.destroyed, true);
  }
});
