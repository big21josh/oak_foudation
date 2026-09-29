import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const newToken = () => randomBytes(32).toString('hex');
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const validToken = (token: string | undefined): token is string =>
  !!token && /^[a-f0-9]{64}$/.test(token);

export function secretMatches(actual: string, expected: string | undefined) {
  if (!expected) return true;
  try {
    return timingSafeEqual(
      Buffer.from(tokenHash(actual.trim())),
      Buffer.from(tokenHash(expected.trim())),
    );
  } catch {
    return false;
  }
}

export function eventDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Harare',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map((type) => parts.find((p) => p.type === type)!.value).join('-');
}
