import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { AuthLimiter, clientNetwork } from '../server/auth-limiter.js';
import { HttpError } from '../server/errors.js';

const blocked = (error: unknown) =>
  error instanceof HttpError && error.status === 429 && error.retryAfter === 60;

test('third failure starts a full cooldown, successes do not reset failures, and blocked requests do not extend it', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100_000 });
  const db = new Database(':memory:');
  const limiter = new AuthLimiter(db);
  try {
    await limiter.run('192.0.2.1', async () => false);
    await limiter.run('192.0.2.1', async () => true);
    await limiter.run('192.0.2.1', async () => false);
    t.mock.timers.tick(59_000);
    await assert.rejects(
      limiter.run('192.0.2.1', async () => false),
      blocked,
    );
    t.mock.timers.tick(59_000);
    await assert.rejects(
      limiter.run('192.0.2.1', async () => {
        assert.fail('must not check credentials');
      }),
      /1 seconds/,
    );
    t.mock.timers.tick(1001);
    await limiter.run('192.0.2.1', async () => true);
  } finally {
    db.close();
  }
});

test('parallel distributed failures stop at ten and survive a new limiter instance', async () => {
  const db = new Database(':memory:');
  let checked = 0;
  try {
    const limiter = new AuthLimiter(db);
    const results = await Promise.allSettled(
      Array.from({ length: 16 }, (_, index) =>
        limiter.run(`192.0.2.${index}`, async () => {
          checked++;
          return false;
        }),
      ),
    );
    assert.equal(checked, 10);
    assert.equal(
      results.filter((result) => result.status === 'rejected').length,
      7,
    );
    await assert.rejects(
      new AuthLimiter(db).run('203.0.113.1', async () => true),
      blocked,
    );
  } finally {
    db.close();
  }
});

test('ipv6 addresses share a /64 and ipv4-mapped addresses cannot bypass the ipv4 key', () => {
  assert.equal(clientNetwork('2001:db8::1'), clientNetwork('2001:db8::ffff'));
  assert.notEqual(
    clientNetwork('2001:db8::1'),
    clientNetwork('2001:db8:0:1::1'),
  );
  assert.equal(clientNetwork('::ffff:192.0.2.1'), clientNetwork('192.0.2.1'));
  assert.equal(clientNetwork('forged, 192.0.2.1'), 'unknown');
});

test('unavailable storage fails closed before checking credentials', async () => {
  const db = new Database(':memory:');
  const limiter = new AuthLimiter(db);
  db.close();
  await assert.rejects(
    limiter.run('192.0.2.1', async () => {
      assert.fail('must not check credentials');
    }),
    (error: unknown) => error instanceof HttpError && error.status === 503,
  );
});

test('cooldowns survive closing and reopening sqlite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tg-drop-limit-'));
  const path = join(directory, 'limits.db');
  const initial = new Database(path);
  try {
    const limiter = new AuthLimiter(initial);
    await limiter.run('192.0.2.1', async () => false);
    await limiter.run('192.0.2.1', async () => false);
    await assert.rejects(
      limiter.run('192.0.2.1', async () => false),
      blocked,
    );
  } finally {
    initial.close();
  }
  const reopened = new Database(path);
  try {
    await assert.rejects(
      new AuthLimiter(reopened).run('192.0.2.1', async () => true),
      (error: unknown) => error instanceof HttpError && error.status === 429,
    );
  } finally {
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
