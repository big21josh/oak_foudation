import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHash, sessionIsActive, SESSION_MAX_AGE } from '../src/lib/security';

test('session credentials are keyed and change when the session secret rotates', () => {
  const token = 'a'.repeat(64);
  const hash = sessionHash(token, 'b'.repeat(64));
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.notEqual(hash, sessionHash(token, 'c'.repeat(64)));
  assert.throws(() => sessionHash(token, ''), /SESSION_SECRET/);
  assert.throws(() => sessionHash(token, 'short'), /SESSION_SECRET/);
});

test('server session expiry matches the 30-day cookie, including existing registrations', () => {
  const createdAt = '2026-10-19T00:00:00.000Z';
  const expiry = Date.parse(createdAt) + SESSION_MAX_AGE * 1000;
  assert.equal(sessionIsActive({ createdAt }, expiry - 1), true);
  assert.equal(sessionIsActive({ createdAt }, expiry), false);
  assert.equal(sessionIsActive({ createdAt, sessionExpiresAt: 'invalid' }, expiry - 1), false);
  assert.equal(
    sessionIsActive(
      { createdAt, sessionExpiresAt: '2026-10-20T00:00:00.000Z' },
      Date.parse('2026-10-21'),
    ),
    false,
  );
});
