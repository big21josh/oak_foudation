import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { hash } from 'bcryptjs';

export async function runParticipantSmoke() {
  const { adminClient } = await import('../src/lib/supabase/admin');
  const repo = await import('../src/lib/repository');
  const normalized = await import('../src/lib/participant-repository');
  const { sessionHash } = await import('../src/lib/security');
  const client = adminClient();
  const participants: string[] = [];
  const notes: string[] = [];
  const admins: string[] = [];
  const run = randomUUID();
  const qaAddress = `127.0.0.${(parseInt(run.slice(0, 2), 16) % 253) + 1}`;
  const base = process.env.SUPABASE_SMOKE_BASE_URL;
  const input = {
    firstName: 'Synthetic',
    lastName: 'Database QA',
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
  try {
    const partner = await repo.register(input);
    participants.push(partner.id);
    assert.ok(partner.code);
    assert.ok(partner.sessionToken);
    await assert.rejects(repo.register(input), /already registered/);
    const session = await normalized.getSession(partner.sessionToken);
    assert.equal(session?.participant_id, partner.id);
    assert.equal(session?.token_hash, sessionHash(partner.sessionToken));
    const checkins = await Promise.all(Array.from({ length: 8 }, () => repo.checkIn(partner.code)));
    assert.equal(checkins.filter((result) => !result?.already).length, 1);
    assert.ok(
      checkins.every(
        (result) => result?.registration.checkedInAt === checkins[0]!.registration.checkedInAt,
      ),
    );
    const presenter = await repo.register({
      ...input,
      role: 'Presenter',
      email: `oak-qa-presenter-${run}@example.test`,
    });
    participants.push(presenter.id);
    assert.equal(presenter.code, '');
    const content = await repo.content(presenter.id);
    assert.ok(content.sessions.length, 'An event session is required to test notes.');
    const sessionId = content.sessions[0].id;
    const note = await repo.addNote({
      ownerId: presenter.id,
      sessionId,
      text: `Synthetic note ${run}`,
      day: content.sessions[0].day,
      name: 'Synthetic',
      organisation: 'QA',
    });
    notes.push(note.id);
    assert.ok((await repo.content(presenter.id)).notes.some((n) => n.id === note.id));
    assert.ok(!(await repo.content(partner.id)).notes.some((n) => n.id === note.id));
    assert.deepEqual((await repo.content()).notes, []);
    await assert.rejects(
      repo.updateNote(note.id, partner.id, { ...note, text: 'Unauthorized edit' }),
      /not found/,
    );
    assert.equal(
      (await repo.updateNote(note.id, presenter.id, { ...note, text: 'Edited synthetic note' }))
        .text,
      'Edited synthetic note',
    );
    const username = `oak-qa-${run}`;
    const password = randomBytes(24).toString('hex');
    const adminId = randomUUID();
    const { error: adminError } = await client
      .from('admins')
      .insert({ id: adminId, username, password_hash: await hash(password, 10), is_master: false });
    assert.equal(adminError, null);
    admins.push(adminId);
    assert.equal(await normalized.signInAdmin(username, password + 'wrong'), null);
    const adminToken = await normalized.signInAdmin(username, password);
    assert.ok(adminToken);
    assert.equal((await normalized.getSession(adminToken))?.admin_id, adminId);
    const adminNote = await repo.addNote(
      {
        ownerId: adminId,
        sessionId,
        text: 'Synthetic staff note',
        day: content.sessions[0].day,
        name: 'Synthetic staff',
        organisation: 'QA',
      },
      'admin',
    );
    notes.push(adminNote.id);
    assert.ok((await repo.content(adminId)).notes.some((n) => n.id === adminNote.id));
    assert.ok(!(await repo.content(presenter.id)).notes.some((n) => n.id === adminNote.id));
    if (base) {
      assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
      const request = (path: string, cookie = '', body?: object) =>
        fetch(base + path, {
          method: body ? 'POST' : 'GET',
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': qaAddress,
            ...(cookie ? { cookie } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(60000),
        });
      const partnerCookie = `oak-session=${partner.sessionToken}`;
      const presenterCookie = `oak-session=${presenter.sessionToken}`;
      const qr = await request('/qr-code?id=' + presenter.id, partnerCookie);
      assert.equal(qr.status, 200);
      assert.ok((await qr.text()).includes(partner.code));
      assert.equal((await request('/api/attendance', partnerCookie)).status, 403);
      assert.equal(
        (await request('/api/check-in', presenterCookie, { code: partner.code })).status,
        403,
      );
      assert.equal(
        (await request('/api/register', '', { ...input, role: 'Coordination Team' })).status,
        403,
      );
      const login = await request('/api/auth/sign-in', '', { username, password });
      assert.equal(login.status, 200, `Staff login: ${await login.clone().text()}`);
      const adminCookie = login.headers.get('set-cookie')!.split(';')[0];
      assert.ok(adminCookie.startsWith('oak_admin_session='));
      const attendance = await request('/api/attendance', adminCookie);
      assert.equal(attendance.status, 200, `Attendance: ${await attendance.clone().text()}`);
      const attendanceBody = await attendance.json();
      assert.ok(attendanceBody.registrations.some((r: { id: string }) => r.id === partner.id));
      const scan = await request('/api/check-in', adminCookie, { code: partner.code });
      assert.equal(scan.status, 200, `Check-in: ${await scan.clone().text()}`);
      assert.equal((await scan.json()).already, true);
      const submitted = await request('/api/notes', presenterCookie, {
        id: note.id,
        ownerId: partner.id,
        sessionId,
        day: content.sessions[0].day,
        text: 'Synthetic HTTP note',
      });
      assert.equal(submitted.status, 200, `Note save: ${await submitted.clone().text()}`);
      const submittedNote = (await submitted.json()).note;
      notes.push(submittedNote.id);
      assert.equal(submittedNote.ownerId, presenter.id);
      assert.equal((await request('/api/auth/sign-out', partnerCookie, {})).status, 200);
      assert.equal(await normalized.getSession(partner.sessionToken), null);
      assert.equal((await request('/api/auth/sign-out', adminCookie, {})).status, 200);
      assert.equal((await request('/api/attendance', adminCookie)).status, 403);
      // Credential rotation invalidates an otherwise unexpired admin session.
      const { error } = await client
        .from('admins')
        .update({ credential_version: 1 })
        .eq('id', adminId);
      assert.equal(error, null);
      assert.equal(
        (await request('/api/attendance', `oak_admin_session=${adminToken}`)).status,
        403,
      );
      console.log(
        'PASS: participant/admin HTTP sessions, staff password login, coordinator authorization, QR/note ownership, staff check-in, sign-out and credential-version revocation.',
      );
    }
    await repo.revokeRegistrationSession(partner.sessionToken);
    await repo.revokeRegistrationSession(presenter.sessionToken);
    await repo.revokeRegistrationSession(adminToken);
    assert.equal(await normalized.getSession(partner.sessionToken), null);
    console.log(
      'PASS: participants schema, atomic registration, unique email, eight concurrent check-ins, private participant/admin notes and session revocation. No emails sent.',
    );
  } finally {
    // Remove only IDs created by this run; preserve every existing account and participant.
    const tasks: Array<[string, string, string[]]> = [
      ['rate_limits', 'key', [`staff-sign-in:${sessionHash(qaAddress)}`]],
      ['session_notes', 'id', notes],
      ['auth_sessions', 'participant_id', participants],
      ['auth_sessions', 'admin_id', admins],
      ['checkins', 'participant_id', participants],
      ['participants', 'id', participants],
      ['admins', 'id', admins],
    ];
    let cleanupFailed = false;
    for (const [table, column, ids] of tasks) {
      if (!ids.length) continue;
      const { error } = await client.from(table).delete().in(column, ids);
      if (error) {
        console.error(`Synthetic cleanup failed for ${table}: ${error.code}`);
        cleanupFailed = true;
      }
    }
    if (cleanupFailed) throw new Error('Synthetic database cleanup needs attention.');
    console.log('Synthetic participant, note, check-in, session and admin records removed.');
  }
}
