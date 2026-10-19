import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Uses only a local mock database. Run after npm run build.
const database = createServer((_request, response) => {
  response.writeHead(503, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ code: 'PGRST000', message: 'Synthetic database outage' }));
});
database.listen(0, '127.0.0.1');
await once(database, 'listening');
const port = Number(process.env.SESSION_FAILURE_TEST_PORT || 3017);
const base = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SUPABASE_URL: `http://127.0.0.1:${database.address().port}`,
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-key',
      SUPABASE_SECRET_KEY: 'synthetic-server-key',
      SESSION_SECRET: 'synthetic-session-secret-for-regression-testing-only',
      RESEND_API_KEY: '',
      EMAIL_FROM: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
});
child.stderr.on('data', (chunk) => {
  output += chunk;
});
try {
  const deadline = Date.now() + 30000;
  while (!output.includes('Ready in')) {
    if (child.exitCode !== null) throw new Error('Regression server failed to start.');
    if (Date.now() > deadline) throw new Error('Regression server startup timed out.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const cookie = `oak-session=${'a'.repeat(64)}`;
  for (const path of ['/', '/privacy']) {
    const response = await fetch(base + path, {
      headers: { cookie },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(
      response.status,
      200,
      `${path} should stay available during a session lookup failure`,
    );
    const body = await response.text();
    assert.ok(!body.includes('3629637693'));
    if (path === '/') assert.ok(body.includes('First Name'));
  }
  const protectedResponse = await fetch(base + '/api/attendance', {
    headers: { cookie },
    signal: AbortSignal.timeout(15000),
  });
  assert.notEqual(protectedResponse.status, 200, 'Database failure must not grant access.');
  const denied = await protectedResponse.json();
  assert.ok(denied.error);
  assert.equal(denied.registrations, undefined);
  assert.ok(output.includes('Supabase registration session lookup failed'));
  console.log(
    'PASS: registration/privacy pages survive a saved-cookie database outage; attendance stays protected and server diagnostics are recorded.',
  );
} finally {
  child.kill();
  if (child.exitCode === null) await once(child, 'exit');
  await new Promise((resolve) => database.close(resolve));
}
