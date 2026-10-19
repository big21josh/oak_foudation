import { createHmac, randomBytes } from 'node:crypto';

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function sessionHash(token: string, secret = process.env.SESSION_SECRET) {
  if (!secret || secret.length < 32)
    throw new Error('Set SESSION_SECRET to a random value of at least 32 characters.');
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function sessionIsActive(
  entry: { createdAt: string; sessionExpiresAt?: string },
  now = Date.now(),
) {
  const expiresAt = entry.sessionExpiresAt
    ? Date.parse(entry.sessionExpiresAt)
    : Date.parse(entry.createdAt) + SESSION_MAX_AGE * 1000;
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export const newToken = () => randomBytes(32).toString('hex');
export const validToken = (token: string | undefined): token is string =>
  !!token && /^[a-f0-9]{64}$/.test(token);

export function eventDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Harare',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join('-');
}
