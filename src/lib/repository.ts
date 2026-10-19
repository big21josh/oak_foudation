import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { cookies } from 'next/headers';
import { adminClient } from './supabase/admin';
import { createClient } from './supabase/server';
import { isConfigured } from './supabase/config';
import { initialNotes, partners, sessions } from './data';
import { newToken, sessionHash, validToken, sessionIsActive, SESSION_MAX_AGE } from './security';
import type { Registration, Note, Partner, Session } from './types';

type StoredRegistration = Omit<Registration, 'sessionToken'> & {
  sessionToken?: string;
  sessionTokenHash?: string;
  sessionExpiresAt?: string;
};
type RegistrationRow = {
  id: string;
  code: string | null;
  email: string;
  data: StoredRegistration;
  checked_in_at: string | null;
  created_at: string;
};
type LocalData = { registrations: StoredRegistration[]; notes: Note[] };
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

// Use the existing registrations/notes schema; never expose stored session credentials.
function registrationFromRow(row: RegistrationRow): Registration {
  return publicRegistration({
    ...row.data,
    id: row.id,
    code: row.code || '',
    email: row.email,
    createdAt: row.created_at,
    checkedInAt: row.checked_in_at,
  });
}

function publicRegistration(stored: StoredRegistration): Registration {
  const { sessionToken, sessionTokenHash, sessionExpiresAt, ...registration } = stored;
  return registration;
}

export async function staffUser() {
  if (!isConfigured()) return null;
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return null;
  const { data: staff, error: staffError } = await adminClient()
    .from('staff')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (staffError) throw new Error('Unable to verify Coordination Team access.');
  return staff ? user : null;
}

export async function content(ownerId?: string) {
  if (!isConfigured()) {
    const data = await localRead();
    return {
      partners,
      sessions,
      notes: ownerId ? data.notes.filter((n) => n.ownerId === ownerId) : [],
    };
  }
  const client = adminClient();
  const [p, s, n] = await Promise.all([
    client.from('partners').select('data').order('position'),
    client.from('sessions').select('data').order('position'),
    ownerId
      ? client
          .from('notes')
          .select('data')
          .eq('data->>ownerId', ownerId)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (p.error || s.error || n.error)
    throw new Error('Event content could not be loaded. Please try again.');
  return {
    partners: (p.data || []).map((row) => row.data as Partner),
    sessions: (s.data || []).map((row) => row.data as Session),
    notes: (n.data || []).map((row) => row.data as Note),
  };
}

export async function register(
  input: Omit<Registration, 'id' | 'code' | 'createdAt' | 'checkedInAt'>,
) {
  // Live coordinator access is tied to a verified Supabase Auth staff account.
  if (isConfigured() && input.role === 'Coordination Team' && !(await staffUser()))
    throw new Error('Sign in with your approved Coordination Team account at /staff.');
  const token = newToken();
  const entry: Registration = {
    ...input,
    id: randomUUID(),
    code:
      input.role === 'Partner' ? 'OAK-2026-' + randomBytes(16).toString('hex').toUpperCase() : '',
    email: input.email.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
    checkedInAt: null,
  };
  const stored: StoredRegistration = {
    ...entry,
    sessionTokenHash: sessionHash(token),
    sessionExpiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(),
  };
  if (!isConfigured()) {
    await mutate((data) => {
      if (data.registrations.some((r) => r.email === entry.email))
        throw new Error(
          'This email is already registered. Use your saved pass or contact event staff.',
        );
      data.registrations.push(stored);
    });
  } else {
    const { error } = await adminClient()
      .from('registrations')
      .insert({
        id: entry.id,
        code: entry.code || null,
        email: entry.email,
        data: stored,
      });
    if (error?.code === '23505')
      throw new Error(
        'This email is already registered. Use your saved pass or contact event staff.',
      );
    if (error) throw new Error('Registration could not be saved. Please try again.');
  }
  return { ...entry, sessionToken: token };
}

export async function findRegistration(code: string): Promise<Registration | null> {
  const normalized = code.trim().toUpperCase();
  if (!isConfigured()) {
    const entry = (await localRead()).registrations.find((r) => r.code === normalized);
    return entry ? publicRegistration(entry) : null;
  }
  const { data, error } = await adminClient()
    .from('registrations')
    .select('*')
    .eq('code', normalized)
    .maybeSingle();
  if (error) throw new Error('Registration could not be verified. Please try again.');
  return data ? registrationFromRow(data as RegistrationRow) : null;
}

async function sessionRegistration(token: string): Promise<StoredRegistration | null> {
  if (!validToken(token)) return null;
  const hash = sessionHash(token);
  if (!isConfigured()) {
    const entry = (await localRead()).registrations.find(
      (r) => r.sessionTokenHash === hash || r.sessionToken === token,
    );
    return entry && sessionIsActive(entry) ? entry : null;
  }
  const { data, error, status } = await adminClient()
    .from('registrations')
    .select('*')
    .or(`data->>sessionTokenHash.eq.${hash},data->>sessionToken.eq.${token}`)
    .maybeSingle();
  if (error) {
    // Record only status/code; never log the cookie, keyed hash, or credentials.
    console.error('Supabase registration session lookup failed', { status, code: error.code });
    throw new Error('Your session could not be verified. Please try again.');
  }
  if (!data || !sessionIsActive(data.data)) return null;
  return { ...data.data, id: data.id, checkedInAt: data.checked_in_at };
}

export async function myRegistration() {
  const jar = await cookies();
  const token = jar.get('oak-session')?.value || jar.get('oak_participant_session')?.value;
  if (!token) return null;
  const entry = await sessionRegistration(token);
  return entry ? publicRegistration(entry) : null;
}

export async function revokeRegistrationSession(token: string | undefined) {
  if (!validToken(token)) return;
  const hash = sessionHash(token);
  if (!isConfigured()) {
    await mutate((data) => {
      for (const entry of data.registrations) {
        if (entry.sessionTokenHash === hash || entry.sessionToken === token) {
          delete entry.sessionToken;
          delete entry.sessionTokenHash;
          delete entry.sessionExpiresAt;
        }
      }
    });
    return;
  }
  const entry = await sessionRegistration(token);
  if (!entry) return;
  const data = publicRegistration(entry);
  const { error } = await adminClient()
    .from('registrations')
    .update({ data })
    .eq('id', entry.id)
    .or(`data->>sessionTokenHash.eq.${hash},data->>sessionToken.eq.${token}`);
  if (error) throw new Error('Sign-out could not be completed. Please try again.');
}

export async function allRegistrations(): Promise<Registration[]> {
  if (!isConfigured()) return (await localRead()).registrations.map(publicRegistration);
  const { data, error } = await adminClient()
    .from('registrations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Attendance could not be loaded. Please try again.');
  return (data as RegistrationRow[]).map(registrationFromRow);
}

export async function checkIn(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!isConfigured())
    return mutate((data) => {
      const entry = data.registrations.find((r) => r.code === normalized && r.role === 'Partner');
      if (!entry) return null;
      const already = Boolean(entry.checkedInAt);
      entry.checkedInAt ??= new Date().toISOString();
      return { registration: publicRegistration(entry), already };
    });
  // A single conditional UPDATE is atomic. Concurrent scans cannot overwrite the first timestamp.
  // Attendance is stored on the registration row, so there is no second status table to desynchronise.
  const { data, error } = await adminClient()
    .from('registrations')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('code', normalized)
    .eq('data->>role', 'Partner')
    .is('checked_in_at', null)
    .select('*')
    .maybeSingle();
  if (error) throw new Error('Check-in could not be saved. Please try again.');
  if (data) return { registration: registrationFromRow(data as RegistrationRow), already: false };
  const existing = await findRegistration(normalized);
  if (!existing || existing.role !== 'Partner') return null;
  if (!existing.checkedInAt) throw new Error('Check-in could not be confirmed. Please try again.');
  return { registration: existing, already: true };
}

export async function addNote(input: Omit<Note, 'id' | 'time'>) {
  const note: Note = {
    ...input,
    id: randomUUID(),
    time: new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Harare',
    }),
  };
  if (!input.ownerId) throw new Error('A note owner is required.');
  if (!isConfigured())
    await mutate((data) => {
      data.notes.push(note);
    });
  else {
    const { error } = await adminClient().from('notes').insert({ id: note.id, data: note });
    if (error) throw new Error('Your note could not be saved. Please try again.');
  }
  return note;
}

export async function updateNote(id: string, ownerId: string, input: Omit<Note, 'id' | 'time'>) {
  if (!isConfigured())
    return mutate((data) => {
      const note = data.notes.find((n) => n.id === id && n.ownerId === ownerId);
      if (!note) throw new Error('Note not found.');
      Object.assign(note, input, { ownerId });
      return note;
    });
  const { data: row, error: readError } = await adminClient()
    .from('notes')
    .select('data')
    .eq('id', id)
    .eq('data->>ownerId', ownerId)
    .maybeSingle();
  if (readError) throw new Error('Your note could not be loaded. Please try again.');
  if (!row) throw new Error('Note not found.');
  const note: Note = { ...row.data, ...input, id, ownerId };
  const { data, error } = await adminClient()
    .from('notes')
    .update({ data: note })
    .eq('id', id)
    .eq('data->>ownerId', ownerId)
    .select('id')
    .maybeSingle();
  if (error) throw new Error('Your note could not be saved. Please try again.');
  if (!data) throw new Error('Note not found.');
  return note;
}

export async function recordEmailStatus(entry: Registration, emailStatus: string) {
  entry.emailStatus = emailStatus;
  if (!isConfigured())
    return mutate((data) => {
      const row = data.registrations.find((r) => r.id === entry.id);
      if (row) row.emailStatus = emailStatus;
    });
  const client = adminClient();
  const { data: row, error: readError } = await client
    .from('registrations')
    .select('data')
    .eq('id', entry.id)
    .single();
  if (readError) throw new Error('Email status could not be recorded.');
  // Match the version read so a concurrent sign-out cannot be undone by this metadata update.
  const { error } = await client
    .from('registrations')
    .update({ data: { ...row.data, emailStatus } })
    .eq('id', entry.id)
    .eq('data', JSON.stringify(row.data));
  if (error) throw new Error('Email status could not be recorded.');
}
