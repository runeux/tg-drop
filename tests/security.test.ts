import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCode,
  hashPassword,
  normalizeCode,
  signToken,
  verifyPassword,
  verifyToken,
} from '../server/security.js';

test('codes normalize spaces and case, reject ambiguous characters', () => {
  for (let index = 0; index < 1000; index++) {
    const code = generateCode();
    assert.match(code, /^[2-9A-HJ-NP-Z]{4}(?:-[2-9A-HJ-NP-Z]{4}){3}$/);
    assert.equal(normalizeCode(code.toLowerCase().replaceAll('-', ' ')), code);
  }
  assert.equal(normalizeCode('0000-OOOO-IIII'), null);
  assert.equal(normalizeCode('ABCD'), null);
  assert.equal(normalizeCode('abcd efgh jklm'), null);
  assert.equal(normalizeCode('abcd efgh jklm npqr'), 'ABCD-EFGH-JKLM-NPQR');
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
