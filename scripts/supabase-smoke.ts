import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnvConfig } from '@next/env';

// Run with: node --conditions=react-server --import tsx scripts/supabase-smoke.ts
// Creates synthetic records in the configured project and removes only those records.
async function main() {
  loadEnvConfig(process.cwd());
  const { adminClient } = await import('../src/lib/supabase/admin');
  const repo = await import('../src/lib/repository');
  const client = adminClient();
  const registrations: string[] = [];
  const notes: string[] = [];
  const run = randomUUID();
  try {
    const input = {
      firstName: 'Synthetic',
      lastName: 'Connection test',
      organisation: 'Synthetic QA',
      email: `oak-qa-${run}@example.test`,
      role: 'Partner',
      phone: '+263000000000',
      programmeArea: '',
      dietary: '',
      accessibility: '',
      travel: '',
      accommodation: '',
      consent: true,
    };
    const partner = await repo.register(input);
    registrations.push(partner.id);
    assert.ok(partner.sessionToken);
    assert.ok(partner.code);
    await assert.rejects(repo.register(input), /already registered/);
    const { data: stored, error } = await client
      .from('registrations')
      .select('data')
      .eq('id', partner.id)
      .single();
    assert.equal(error, null);
    assert.equal(stored!.data.sessionToken, undefined);
    assert.ok(stored!.data.sessionTokenHash);
    assert.ok(stored!.data.sessionExpiresAt);
    await repo.recordEmailStatus(partner, 'not-configured');
    const results = await Promise.all(Array.from({ length: 8 }, () => repo.checkIn(partner.code)));
    assert.equal(results.filter((result) => !result?.already).length, 1);
    const timestamp = results[0]!.registration.checkedInAt;
    assert.ok(timestamp);
    assert.ok(results.every((result) => result?.registration.checkedInAt === timestamp));
    const publicEntry = await repo.findRegistration(partner.code);
    assert.equal(publicEntry!.checkedInAt, timestamp);
    assert.equal(publicEntry!.sessionToken, undefined);
    assert.equal('sessionTokenHash' in publicEntry!, false);
    const note = await repo.addNote({
      ownerId: partner.id,
      sessionId: 'opening',
      text: `Synthetic private note ${run}`,
      day: 1,
      name: 'Synthetic',
      organisation: 'QA',
    });
    notes.push(note.id);
    const saved = await repo.content(partner.id);
    assert.ok(saved.notes.some((entry) => entry.id === note.id));
    const other = await repo.content(randomUUID());
    assert.ok(!other.notes.some((entry) => entry.id === note.id));
    assert.deepEqual((await repo.content()).notes, []);
    await assert.rejects(
      repo.updateNote(note.id, randomUUID(), { ...note, text: 'Unauthorized' }),
      /not found/,
    );
    const edited = await repo.updateNote(note.id, partner.id, {
      ...note,
      text: 'Edited synthetic note',
    });
    assert.equal(edited.text, 'Edited synthetic note');
    const base = process.env.SUPABASE_SMOKE_BASE_URL;
    if (base) {
      assert.ok(
        ['127.0.0.1', 'localhost'].includes(new URL(base).hostname),
        'HTTP checks must target a local app.',
      );
      const presenter = await repo.register({
        ...input,
        role: 'Presenter',
        email: `oak-qa-presenter-${run}@example.test`,
      });
      registrations.push(presenter.id);
      assert.equal(presenter.code, '');
      const request = (path: string, token: string | undefined, body?: object) =>
        fetch(base + path, {
          method: body ? 'POST' : 'GET',
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { cookie: `oak-session=${token}` } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(60000),
        });
      const qr = await request(`/qr-code?id=${presenter.id}`, partner.sessionToken);
      assert.equal(qr.status, 200);
      assert.ok((await qr.text()).includes(partner.code), 'QR page must use the session owner.');
      assert.equal((await request('/api/attendance', partner.sessionToken)).status, 403);
      assert.equal(
        (await request('/api/check-in', presenter.sessionToken, { code: partner.code })).status,
        403,
      );
      const created = await request('/api/notes', presenter.sessionToken, {
        ownerId: partner.id,
        participant_id: partner.id,
        sessionId: 'opening',
        day: 1,
        text: `Private HTTP note ${run}`,
      });
      assert.equal(created.status, 200);
      const result = await created.json();
      notes.push(result.note.id);
      assert.equal(result.note.ownerId, presenter.id);
      const savedNote = (await repo.content(presenter.id)).notes.find(
        (n) => n.id === result.note.id,
      );
      assert.ok(savedNote);
      const crossUser = await request('/api/notes', presenter.sessionToken, {
        id: note.id,
        sessionId: 'opening',
        day: 1,
        text: 'Unauthorized cross-user change',
      });
      assert.equal(crossUser.status, 400);
      const logout = await request('/api/auth/sign-out', partner.sessionToken, {});
      assert.equal(logout.status, 200);
      assert.ok(logout.headers.get('set-cookie')?.includes('Max-Age=0'));
      const replay = await request('/qr-code', partner.sessionToken);
      const replayBody = await replay.text();
      assert.ok(replay.status === 307 || replayBody.includes('NEXT_REDIRECT'));
      assert.ok(
        !replayBody.includes(partner.code),
        'A revoked cookie must not expose its QR code.',
      );
      console.log(
        'PASS: live HTTP session lookup, QR ownership, role restrictions, note ownership tampering, sign-out and cookie replay denial.',
      );
    }
    await repo.revokeRegistrationSession(partner.sessionToken);
    const { data: revoked, error: revokeError } = await client
      .from('registrations')
      .select('data')
      .eq('id', partner.id)
      .single();
    assert.equal(revokeError, null);
    assert.equal(revoked!.data.sessionTokenHash, undefined);
    await repo.recordEmailStatus(partner, 'not-configured');
    const { data: afterEmail } = await client
      .from('registrations')
      .select('data')
      .eq('id', partner.id)
      .single();
    assert.equal(afterEmail!.data.sessionTokenHash, undefined);
    console.log(
      'PASS: existing Supabase schema, registration, duplicate email rejection, session storage/revocation, eight concurrent check-ins, note persistence and ownership. No emails sent.',
    );
  } finally {
    for (const [table, ids] of [
      ['notes', notes],
      ['registrations', registrations],
    ] as const) {
      if (!ids.length) continue;
      const { error } = await client.from(table).delete().in('id', ids);
      if (error) throw new Error(`Synthetic test cleanup failed for ${table}.`);
    }
    console.log('Synthetic test records removed.');
  }
}
main().catch((error: unknown) => {
  console.error(
    'Supabase integration check failed:',
    error instanceof Error ? error.message : 'Database request failed.',
  );
  process.exitCode = 1;
});
