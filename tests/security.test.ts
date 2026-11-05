import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCode,
  hashPassword,
  normalizeCode,
  RateLimiter,
  signToken,
  verifyPassword,
  verifyToken,
} from '../server/security.js';
import { expiresAt } from '../shared/files.js';

test('codes normalize spaces and case, reject ambiguous characters', () => {
  for (let index = 0; index < 1000; index++) {
    const code = generateCode();
    assert.match(
      code,
      /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/,
    );
    assert.equal(normalizeCode(code.toLowerCase().replaceAll('-', ' ')), code);
  }
  assert.equal(normalizeCode('0000-OOOO-IIII'), null);
  assert.equal(normalizeCode('ABCD'), null);
});

test('password hashes are salted and verified', () => {
  const hash = hashPassword('correct horse');
  assert.equal(verifyPassword('correct horse', hash), true);
  assert.equal(verifyPassword('wrong', hash), false);
  assert.equal(verifyPassword('wrong', 'malformed'), false);
  assert.notEqual(hash, hashPassword('correct horse'));
});

test('signed grants reject tampering, expiry, wrong secrets and wrong purposes', () => {
  const secret = 'a'.repeat(64);
  const token = signToken(secret, 'download', 'file-id', 10_000);
  assert.equal(verifyToken(secret, token, 'download'), 'file-id');
  assert.equal(verifyToken(secret, token, 'session'), null);
  assert.equal(verifyToken('wrong', token, 'download'), null);
  assert.equal(verifyToken(secret, `${token}a`, 'download'), null);
  assert.equal(verifyToken(secret, `${token}.extra`, 'download'), null);
  assert.equal(
    verifyToken(
      secret,
      signToken(secret, 'download', 'file-id', -1),
      'download',
    ),
    null,
  );
});

test('expiration uses calendar months and preserves the time of day', () => {
  const january = Date.UTC(2026, 0, 31, 12, 30);
  assert.equal(expiresAt('month', january), Date.UTC(2026, 1, 28, 12, 30));
  assert.equal(expiresAt('3days', january), january + 3 * 86_400_000);
  assert.equal(expiresAt('download', january), null);
  assert.equal(expiresAt('never', january), null);
});

test('rate limits reject excessive requests', () => {
  const limiter = new RateLimiter();
  limiter.check('ip', 2);
  limiter.check('ip', 2);
  assert.throws(() => limiter.check('ip', 2), /Too many attempts/);
  assert.doesNotThrow(() => limiter.check('other-ip', 2));
});
