import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { TelegramClient, User } from '@mtcute/node';

type StartOptions = NonNullable<Parameters<TelegramClient['start']>[0]>;

async function configureTelegram(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'tg-drop-login-'));
  const env = process.env;
  process.env = {
    ...env,
    DATA_DIR: directory,
    STORAGE: 'telegram',
    TG_API_ID: '1',
    TG_API_HASH: 'a'.repeat(32),
    PASSWORD_HASH: 'b'.repeat(80),
    SESSION_SECRET: 'c'.repeat(64),
  };
  t.after(async () => {
    process.env = env;
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function simulateTerminal(t: TestContext) {
  for (const stream of [process.stdin, process.stdout]) {
    const wasTTY = stream.isTTY;
    stream.isTTY = true;
    t.after(() => {
      stream.isTTY = wasTTY;
    });
  }
}

test('telegram login renders the QR in the terminal and closes the client', async (t) => {
  const directory = await configureTelegram(t);
  simulateTerminal(t);
  const log = t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'clear', () => {});
  const destroy = t.mock.method(
    TelegramClient.prototype,
    'destroy',
    async () => {},
  );
  t.mock.method(
    TelegramClient.prototype,
    'start',
    async (options: StartOptions) => {
      assert.ok(options.qrCodeHandler);
      assert.ok(typeof options.password === 'function');
      options.qrCodeHandler('tg://login?token=first', new Date());
      options.qrCodeHandler('tg://login?token=second', new Date());
      return new User({ _: 'user', id: 1, firstName: 'Test' });
    },
  );

  await import('../scripts/telegram-login.js');

  const output = log.mock.calls.map(({ arguments: [line] }) => String(line));
  const codes = output.filter((line) => line.includes('█'));
  assert.equal(codes.length, 2);
  assert.notEqual(codes[0], codes[1]);
  assert.ok(output.includes('telegram connected as Test'));
  assert.ok(
    output.includes(`session saved to ${join(directory, 'telegram.session')}`),
  );
  assert.equal(destroy.mock.callCount(), 1);
});

test(
  'image mode publishes a private PNG during login and removes it afterward',
  { timeout: 5_000 },
  async (t) => {
    await configureTelegram(t);
    simulateTerminal(t);
    const argv = process.argv;
    process.argv = [...argv.slice(0, 2), '--qr-image'];
    t.after(() => {
      process.argv = argv;
    });

    let imagePath: string | undefined;
    t.mock.method(TelegramClient.prototype, 'destroy', async () => {});
    t.mock.method(
      TelegramClient.prototype,
      'start',
      async ({ qrCodeHandler }: StartOptions) => {
        assert.ok(qrCodeHandler);
        imagePath = await new Promise<string>((resolve) => {
          t.mock.method(console, 'log', (line: string) => {
            const image = /^telegram login qr: (.+) \(expires /.exec(line)?.[1];
            if (image) resolve(image);
          });
          qrCodeHandler('tg://login?token=image', new Date());
        });
        assert.equal(
          (await readFile(imagePath)).subarray(1, 4).toString(),
          'PNG',
        );
        assert.equal((await stat(imagePath)).mode & 0o077, 0);
        return new User({ _: 'user', id: 1, firstName: 'Test' });
      },
    );

    await import(
      new URL('../scripts/telegram-login.ts?image', import.meta.url).href
    );
    assert.ok(imagePath);
    await assert.rejects(stat(imagePath), { code: 'ENOENT' });
  },
);

test('server startup directs unauthorized sessions to QR setup', async (t) => {
  await configureTelegram(t);
  const hint = /npm run telegram:login with the same DATA_DIR/;
  const destroy = t.mock.method(
    TelegramClient.prototype,
    'destroy',
    async () => {},
  );
  t.mock.method(
    TelegramClient.prototype,
    'start',
    async (options: StartOptions) => {
      assert.equal(options.qrCodeHandler, undefined);
      assert.ok(typeof options.phone === 'function');
      assert.ok(typeof options.password === 'function');
      assert.throws(options.password, hint);
      return options.phone();
    },
  );

  await assert.rejects(import('../server/index.js'), hint);
  assert.equal(destroy.mock.callCount(), 1);
});
