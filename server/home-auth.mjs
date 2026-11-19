import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export const HOME_SESSION_MS = 12 * 60 * 60 * 1000;

export async function passwordRecord(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
    throw new Error('Use a host password between 8 and 256 characters.');
  }
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt, hash: hash.toString('hex'), key: randomBytes(32).toString('hex') };
}

export async function checkPassword(password, record) {
  if (!record || typeof password !== 'string' || password.length > 256) return false;
  const actual = await derive(password, record.salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const expected = Buffer.from(record.hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sameSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !expected) return false;
  const left = Buffer.from(actual), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueSession(record, now = Date.now()) {
  const expiresAt = now + HOME_SESSION_MS;
  const payload = Buffer.from(JSON.stringify({ issuedAt: now, expiresAt, id: randomBytes(24).toString('hex') })).toString('base64url');
  const signature = createHmac('sha256', record.key).update(payload).digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt };
}

export function verifySession(token, record, now = Date.now()) {
  if (!record || typeof token !== 'string' || token.length > 1024) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', record.key).update(payload).digest('base64url');
  if (!sameSecret(signature, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!Number.isSafeInteger(session.issuedAt) || !Number.isSafeInteger(session.expiresAt) ||
        session.expiresAt - session.issuedAt !== HOME_SESSION_MS || session.issuedAt > now || session.expiresAt <= now) return null;
    return session;
  } catch { return null; }
}
