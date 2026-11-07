import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateCode() {
  // rejection sampling keeps every character equally likely.
  let code = '';
  while (code.length < 16) {
    for (const byte of randomBytes(20)) {
      if (byte >= 256 - (256 % alphabet.length)) continue;
      code += alphabet[byte % alphabet.length];
      if (code.length === 16) break;
    }
  }
  return code.match(/.{4}/g)!.join('-');
}

const reservedCodes = new Set(['API', 'ASSETS', 'FAVICON.SVG', 'INDEX.HTML']);

export function normalizeCustomCode(value: string) {
  const code = value.trim();
  if (!/^[a-z0-9._~-]{1,64}$/i.test(code) || code === '.' || code === '..')
    return null;
  return code.toUpperCase();
}

export function isReservedCode(code: string) {
  return reservedCodes.has(code);
}

export function normalizeGeneratedCode(code: string) {
  const compact = code.toUpperCase().replace(/[\s-]/g, '');
  if (
    compact.length !== 16 ||
    [...compact].some((char) => !alphabet.includes(char))
  )
    return null;
  return compact.match(/.{4}/g)!.join('-');
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(':');
  if (!salt || !expected || !/^[a-f0-9]{128}$/.test(expected)) return false;
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(expected, 'hex'),
  );
}

export function signToken(
  secret: string,
  purpose: string,
  subject: string,
  ttl: number,
) {
  const payload = Buffer.from(
    JSON.stringify({ purpose, subject, exp: Date.now() + ttl }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyToken(
  secret: string,
  token: string,
  purpose: string,
): string | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature || token.split('.').length !== 2) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual))
    return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('purpose' in parsed) ||
      !('exp' in parsed) ||
      !('subject' in parsed)
    )
      return null;
    if (
      parsed.purpose !== purpose ||
      typeof parsed.exp !== 'number' ||
      parsed.exp < Date.now() ||
      typeof parsed.subject !== 'string'
    )
      return null;
    return parsed.subject;
  } catch {
    return null;
  }
}
