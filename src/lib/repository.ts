import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { cookies } from 'next/headers';
import { adminClient } from './supabase/admin';
import { createClient } from './supabase/server';
import { isConfigured } from './supabase/config';
import { initialNotes, partners, sessions, initials } from './data';
import { newToken, tokenHash, validToken, eventDate } from './security';
import type { Registration, Note, Partner, Session } from './types';

type LocalData = { registrations: Registration[]; notes: Note[] };
const localFile = path.join(process.cwd(), '.data', 'demo.json');
const demoRuntime = globalThis as typeof globalThis & { oakDemoQueue?: Promise<unknown> };

async function localRead(): Promise<LocalData> {
  let data: LocalData;
  try {
    data = JSON.parse(await readFile(localFile, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    data = { registrations: [], notes: [...initialNotes] };
  }
  const samples = [
    ['collin', 'Collin', 'Manyande', 'Partner', 'OAK-2026-7842-XKPH'],
    ['james', 'James', 'Odhiambo', 'OAK Staff', 'OAK-2026-1193-JWQA'],
    ['awa', 'Awa', 'Diallo', 'Coordination Team', 'OAK-2026-8832-KLPT'],
    ['kayden', 'Kayden', 'Mamu', 'Partner', 'OAK-2026-5592-FWBN'],
  ];
  for (const [id, firstName, lastName, role, code] of samples) {
    const email = `${id}@example.test`;
    if (data.registrations.some((r) => r.email === email)) continue;
    data.registrations.push({
      id: `demo-${id}`,
      code: role === 'Partner' ? code : '',
      firstName,
      lastName,
      role,
      email,
      organisation: role === 'OAK Staff' ? 'OAK Foundation' : 'Open Society Foundations',
      programmeArea: '',
      phone: '',
      dietary: '',
      accessibility: '',
      travel: '',
      consent: true,
      createdAt: '2026-03-01T09:00:00.000Z',
      checkedInAt: null,
    });
  }
  return data;
}

function mutate<T>(fn: (data: LocalData) => T): Promise<T> {
  const task = (demoRuntime.oakDemoQueue ?? Promise.resolve()).then(async () => {
    const data = await localRead();
    const result = fn(data);
    await mkdir(path.dirname(localFile), { recursive: true });
    const temp = localFile + '.tmp';
    await writeFile(temp, JSON.stringify(data, null, 2));
    await rename(temp, localFile);
    return result;
  });
  demoRuntime.oakDemoQueue = task.catch(() => {});
  return task;
}

function mapParticipant(p: any, checkedInAt: string | null = null): Registration {
  return {
    id: p.id,
    code: p.qr_code_id || p.registration_id || '',
    firstName: p.first_name || '',
    lastName: p.last_name || '',
    organisation: p.organization || '',
    role: p.role || '',
    email: p.email || '',
    phone: p.phone || '',
    programmeArea: p.sub_partner_program_area || '',
    dietary: p.dietary_requirements || '',
    accessibility: p.accessibility_requirements || '',
    travel: p.travel_requirements || '',
    accommodation: p.accommodation_requirements || '',
    consent: p.consent ?? true,
    createdAt: p.registration_date || p.created_at || new Date().toISOString(),
    checkedInAt,
  };
}

export async function staffUser() {
  if (!isConfigured()) return null;
  try {
    const jar = await cookies();
    const token =
      jar.get('oak-session')?.value ||
      jar.get('oak_participant_session')?.value ||
      jar.get('oak_admin_session')?.value;

    if (token && validToken(token)) {
      const hash = tokenHash(token);
      const { data: session } = await adminClient()
        .from('auth_sessions')
        .select('admin_id, participant_id, expires_at')
        .eq('token_hash', hash)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (session) {
        if (session.admin_id) {
          const { data: admin } = await adminClient()
            .from('admins')
            .select('id, username, is_master')
            .eq('id', session.admin_id)
            .maybeSingle();
          if (admin) return { id: admin.id, email: admin.username, role: 'Coordination Team' };
        }
        if (session.participant_id) {
          const { data: part } = await adminClient()
            .from('participants')
            .select('id, role, email')
            .eq('id', session.participant_id)
            .maybeSingle();
          if (part && part.role === 'Coordination Team') {
            return { id: part.id, email: part.email, role: part.role };
          }
        }
      }
    }

    // Fallback: check Supabase auth
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) {
      const { data: staff } = await adminClient()
        .from('staff')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (staff) return user;
    }
  } catch {}
  return null;
}

export async function content(ownerId?: string) {
  if (!isConfigured()) {
    const localNotes = (await localRead()).notes;
    return {
      partners,
      sessions,
      notes: ownerId ? localNotes.filter((note) => note.ownerId === ownerId) : localNotes,
    };
  }
  const client = adminClient();
  try {
    const notesQuery = client.from('session_notes').select('*').order('created_at', { ascending: false });
    if (ownerId) notesQuery.or(`participant_id.eq.${ownerId},admin_id.eq.${ownerId}`);
    const [pRes, sRes, nRes] = await Promise.all([
      client.from('partners').select('*'),
      client.from('sessions').select('*'),
      notesQuery,
    ]);

    let mappedPartners: Partner[] = partners;
    if (pRes.data && pRes.data.length > 0) {
      mappedPartners = pRes.data.map((p: any, idx: number) => {
        if (p.data) return p.data as Partner;
        const fallback = partners[idx] || partners[0];
        return {
          id: p.id,
          name: p.name || fallback.name,
          initials: fallback?.initials || initials(p.name || 'OAK'),
          region: p.region || fallback?.region || 'Global',
          category: fallback?.category || 'Partner',
          tags: p.areas_of_work
            ? p.areas_of_work.split(',').map((t: string) => t.trim())
            : fallback?.tags || [],
          since: p.partner_since || fallback?.since || 2020,
          website: p.website_url || fallback?.website || '',
          about: p.description || fallback?.about || '',
          contact: p.contact_name || fallback?.contact || '',
          email: p.contact_email || fallback?.email || '',
        };
      });
    }

    let mappedSessions: Session[] = sessions;
    if (sRes.data && sRes.data.length > 0) {
      mappedSessions = sRes.data.map((s: any, idx: number) => {
        if (s.data) return s.data as Session;
        const fallback = sessions[idx] || sessions[0];
        const dayNumber = s.day?.includes('Day 2') ? 2 : s.day?.includes('Day 3') ? 3 : 1;
        return {
          id: s.id,
          day: dayNumber,
          time: s.start_time ? s.start_time.slice(0, 5) : fallback.time,
          end: s.end_time ? s.end_time.slice(0, 5) : fallback.end,
          title: s.title || fallback.title,
          speaker: s.speaker || fallback.speaker,
          venue: s.venue || fallback.venue,
          type: fallback.type || 'Plenary',
          description: s.description || fallback.description,
          featured: idx === 0,
        };
      });
    }

    let mappedNotes: Note[] = [];
    if (nRes.data && nRes.data.length > 0) {
      mappedNotes = nRes.data.map((n: any) => {
        if (n.data) return n.data as Note;
        return {
          id: n.id,
          ownerId: n.participant_id || n.admin_id,
          sessionId: n.session_id,
          text: n.note_text || '',
          name: '',
          organisation: '',
          day: 1,
          time: n.created_at
            ? new Date(n.created_at).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Africa/Harare',
              })
            : '09:00',
        };
      });
    }

    return { partners: mappedPartners, sessions: mappedSessions, notes: mappedNotes };
  } catch {
    return { partners, sessions, notes: (await localRead()).notes };
  }
}

export async function register(
  input: Omit<Registration, 'id' | 'code' | 'createdAt' | 'checkedInAt'>,
) {
  const token = newToken();
  const entryId = randomUUID();
  const registrationId = 'OAK-2026-' + randomBytes(16).toString('hex').toUpperCase();
  const code = input.role === 'Partner' ? registrationId : '';

  if (!isConfigured()) {
    const entry: Registration = {
      ...input,
      id: entryId,
      code,
      sessionToken: token,
      createdAt: new Date().toISOString(),
      checkedInAt: null,
    };
    return mutate((data) => {
      if (data.registrations.some((r) => r.email === entry.email)) {
        throw new Error(
          'This email is already registered. Use your saved pass or contact event staff.',
        );
      }
      data.registrations.push(entry);
      return entry;
    });
  }

  const client = adminClient();
  const email = input.email.toLowerCase().trim();

  // Insert participant record
  const { data: participant, error: partError } = await client
    .from('participants')
    .insert({
      id: entryId,
      registration_id: registrationId,
      first_name: input.firstName,
      last_name: input.lastName,
      organization: input.organisation,
      role: input.role,
      email,
      phone: input.phone || null,
      sub_partner_program_area: input.programmeArea || null,
      dietary_requirements: input.dietary || null,
      accessibility_requirements: input.accessibility || null,
      travel_requirements: input.travel || null,
      accommodation_requirements: input.accommodation || null,
      qr_code_id: code || null,
      consent: input.consent ?? true,
      consent_at: new Date().toISOString(),
      registration_status: 'registered',
      registration_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (partError) {
    if (partError.code === '23505') {
      throw new Error(
        'This email is already registered. Use your saved pass or contact event staff.',
      );
    }
    // Fallback: try legacy registrations table
    const legacyEntry: Registration = {
      ...input,
      id: entryId,
      code,
      sessionToken: token,
      createdAt: new Date().toISOString(),
      checkedInAt: null,
    };
    const { error: legErr } = await client
      .from('registrations')
      .insert({ id: legacyEntry.id, code: legacyEntry.code || null, email: legacyEntry.email, data: legacyEntry });
    if (!legErr) return legacyEntry;

    throw new Error('Registration could not be saved. Please try again.');
  }

  // Create session in auth_sessions
  await client.from('auth_sessions').insert({
    token_hash: tokenHash(token),
    participant_id: participant.id,
    credential_version: 0,
    expires_at: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
  });

  const registered = mapParticipant(participant, null);
  registered.sessionToken = token;
  return registered;
}

export async function findRegistration(code: string) {
  if (!isConfigured())
    return (await localRead()).registrations.find((r) => r.code === code) ?? null;

  const client = adminClient();
  const trimmed = code.trim().toUpperCase();
  const { data: p, error } = await client
    .from('participants')
    .select('*, checkins(check_in_time)')
    .or(`qr_code_id.eq.${trimmed},registration_id.eq.${trimmed}`)
    .maybeSingle();

  if (!error && p) {
    const latestCheckin = p.checkins?.[0]?.check_in_time || null;
    return mapParticipant(p, latestCheckin);
  }

  // Fallback to legacy registrations table
  const { data: leg } = await client
    .from('registrations')
    .select('data, checked_in_at')
    .eq('code', trimmed)
    .maybeSingle();
  if (leg) return { ...leg.data, checkedInAt: leg.checked_in_at } as Registration;

  return null;
}

export async function myRegistration() {
  const jar = await cookies();
  const token = jar.get('oak-session')?.value || jar.get('oak_participant_session')?.value;
  if (!token || !validToken(token)) return null;

  if (!isConfigured())
    return (await localRead()).registrations.find((r) => r.sessionToken === token) ?? null;

  const client = adminClient();
  const hash = tokenHash(token);

  // Look up in auth_sessions
  const { data: session } = await client
    .from('auth_sessions')
    .select('participant_id')
    .eq('token_hash', hash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (session?.participant_id) {
    const { data: p } = await client
      .from('participants')
      .select('*, checkins(check_in_time)')
      .eq('id', session.participant_id)
      .maybeSingle();

    if (p) {
      const reg = mapParticipant(p, p.checkins?.[0]?.check_in_time || null);
      reg.sessionToken = token;
      return reg;
    }
  }

  // Fallback: check legacy registrations table if present
  try {
    const { data: legacy } = await client
      .from('registrations')
      .select('data, checked_in_at')
      .eq('data->>sessionToken', token)
      .maybeSingle();
    if (legacy) return { ...legacy.data, checkedInAt: legacy.checked_in_at } as Registration;
  } catch {}

  return null;
}

export async function allRegistrations() {
  if (!isConfigured()) return (await localRead()).registrations;

  const client = adminClient();
  const { data, error } = await client
    .from('participants')
    .select('*, checkins(check_in_time)')
    .order('registration_date', { ascending: false });

  if (!error && data && data.length > 0) {
    return data.map((p) => mapParticipant(p, p.checkins?.[0]?.check_in_time || null));
  }

  // Fallback to legacy registrations table
  try {
    const { data: legacy } = await client
      .from('registrations')
      .select('data, checked_in_at')
      .order('created_at', { ascending: false });
    if (legacy) return legacy.map((r) => ({ ...r.data, checkedInAt: r.checked_in_at })) as Registration[];
  } catch {}

  return [];
}

export async function checkIn(code: string) {
  if (!isConfigured())
    return mutate((data) => {
      const r = data.registrations.find((r) => r.code === code);
      if (!r || r.role !== 'Partner') return null;
      const already = !!r.checkedInAt;
      r.checkedInAt ??= new Date().toISOString();
      return { registration: r, already };
    });

  const candidate = await findRegistration(code);
  if (!candidate || candidate.role !== 'Partner') return null;

  const client = adminClient();
  const today = eventDate();

  // Check if existing checkin today
  const { data: existing } = await client
    .from('checkins')
    .select('check_in_time')
    .eq('participant_id', candidate.id)
    .eq('check_in_date', today)
    .maybeSingle();

  if (existing) {
    return {
      registration: { ...candidate, checkedInAt: existing.check_in_time },
      already: true,
    };
  }

  // Insert checkin
  const { data: inserted, error } = await client
    .from('checkins')
    .insert({
      participant_id: candidate.id,
      check_in_date: today,
      check_in_time: new Date().toISOString(),
      attendance_status: 'checked_in',
    })
    .select('check_in_time')
    .single();

  if (error?.code === '23505') {
    const { data: dup } = await client
      .from('checkins')
      .select('check_in_time')
      .eq('participant_id', candidate.id)
      .eq('check_in_date', today)
      .single();
    return {
      registration: { ...candidate, checkedInAt: dup?.check_in_time || new Date().toISOString() },
      already: true,
    };
  }

  // Also update legacy checked_in_at if column exists
  try {
    await client
      .from('registrations')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('code', code)
      .is('checked_in_at', null);
  } catch {}

  return {
    registration: { ...candidate, checkedInAt: inserted?.check_in_time || new Date().toISOString() },
    already: false,
  };
}

export async function addNote(
  input: Omit<Note, 'id' | 'time'>,
  ownerType: 'participant' | 'admin' = 'participant',
) {
  const noteTime = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Harare',
  });
  const noteId = randomUUID();
  const note: Note = {
    ...input,
    id: noteId,
    time: noteTime,
  };

  if (!isConfigured())
    return mutate((data) => {
      data.notes.push(note);
      return note;
    });

  const client = adminClient();
  if (input.sessionId) {
    const noteRow = {
      id: noteId,
      session_id: input.sessionId,
      participant_id: ownerType === 'participant' ? input.ownerId : null,
      admin_id: ownerType === 'admin' ? input.ownerId : null,
      note_text: input.text,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('session_notes').insert(noteRow);
    if (!error) return note;
  }

  // Fallback to legacy notes table
  await client.from('notes').insert({ id: note.id, data: note });
  return note;
}

export async function updateNote(id: string, ownerId: string, input: Omit<Note, 'id' | 'time'>) {
  if (!isConfigured())
    return mutate((data) => {
      const note = data.notes.find((n) => n.id === id && n.ownerId === ownerId);
      if (!note) throw new Error('Note not found.');
      Object.assign(note, input);
      return note;
    });

  const client = adminClient();
  const { data: updated, error } = await client
    .from('session_notes')
    .update({ note_text: input.text, updated_at: new Date().toISOString() })
    .eq('id', id)
    .or(`participant_id.eq.${ownerId},admin_id.eq.${ownerId}`)
    .select()
    .maybeSingle();

  if (!error && updated) {
    return {
      ...input,
      id,
      time: new Date(updated.updated_at).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Harare',
      }),
    };
  }

  // Fallback to legacy notes table
  const { data } = await client
    .from('notes')
    .select('data')
    .eq('id', id)
    .eq('data->>ownerId', ownerId)
    .maybeSingle();
  if (!data) throw new Error('Note not found.');
  const note = { ...data.data, ...input };
  await client
    .from('notes')
    .update({ data: note })
    .eq('id', id)
    .eq('data->>ownerId', ownerId);
  return note as Note;
}

export async function recordEmailStatus(entry: Registration, emailStatus: string) {
  entry.emailStatus = emailStatus;
  if (!isConfigured())
    return mutate((data) => {
      const row = data.registrations.find((r) => r.id === entry.id);
      if (row) row.emailStatus = emailStatus;
    });

  try {
    await adminClient()
      .from('registrations')
      .update({ data: entry })
      .eq('id', entry.id);
  } catch {}
}
