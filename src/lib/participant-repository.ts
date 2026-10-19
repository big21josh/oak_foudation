import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { compare } from 'bcryptjs';
import { adminClient } from './supabase/admin';
import { eventDate, newToken, sessionHash, validToken, SESSION_MAX_AGE } from './security';
import { initials } from './data';
import type { Registration, Note, Session, Partner } from './types';

type Row = Record<string, unknown>;
type AuthSession = {
  token_hash: string;
  participant_id: string | null;
  admin_id: string | null;
  credential_version: number | null;
  expires_at: string;
};
const text = (row: Row, key: string) => (typeof row[key] === 'string' ? (row[key] as string) : '');
const oldHash = (token: string) => createHash('sha256').update(token).digest('hex');
const hashes = (token: string) => [sessionHash(token), oldHash(token)];

function participant(row: Row): Registration {
  const checkins = Array.isArray(row.checkins) ? (row.checkins as Row[]) : [];
  const timestamps = checkins
    .map((c) => text(c, 'check_in_time'))
    .filter(Boolean)
    .sort();
  return {
    id: text(row, 'id'),
    code: text(row, 'qr_code_id'),
    firstName: text(row, 'first_name'),
    lastName: text(row, 'last_name'),
    organisation: text(row, 'organization'),
    role: text(row, 'role'),
    email: text(row, 'email'),
    phone: text(row, 'phone'),
    programmeArea: text(row, 'sub_partner_program_area'),
    dietary: text(row, 'dietary_requirements'),
    accessibility: text(row, 'accessibility_requirements'),
    travel: text(row, 'travel_requirements'),
    accommodation: text(row, 'accommodation_requirements'),
    consent: row.consent === true,
    createdAt: text(row, 'registration_date') || text(row, 'created_at'),
    checkedInAt: timestamps[0] || null,
  };
}

export async function getSession(token: string | undefined): Promise<AuthSession | null> {
  if (!validToken(token)) return null;
  const { data, error } = await adminClient()
    .from('auth_sessions')
    .select('*')
    .in('token_hash', hashes(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) {
    console.error('Supabase participant session lookup failed', { code: error.code });
    throw new Error('Your session could not be verified. Please try again.');
  }
  return data as AuthSession | null;
}

export async function staffUser() {
  const jar = await cookies();
  const session = await getSession(jar.get('oak_admin_session')?.value);
  if (!session?.admin_id) return null;
  const { data, error } = await adminClient()
    .from('admins')
    .select('id,username,credential_version')
    .eq('id', session.admin_id)
    .maybeSingle();
  if (error) throw new Error('Staff access could not be verified.');
  if (!data || data.credential_version !== session.credential_version) return null;
  return { id: data.id as string, email: data.username as string };
}

export async function signInAdmin(username: string, password: string) {
  const { data, error } = await adminClient()
    .from('admins')
    .select('id,username,password_hash,credential_version')
    .eq('username', username.trim())
    .maybeSingle();
  if (error) throw new Error('Staff sign-in is temporarily unavailable.');
  // Use a valid fixed dummy hash to keep unknown usernames on the bcrypt verification path.
  const hash =
    data?.password_hash || '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const valid = await compare(password, hash);
  if (!data || !valid) return null;
  const token = newToken();
  const { error: sessionError } = await adminClient()
    .from('auth_sessions')
    .insert({
      token_hash: sessionHash(token),
      admin_id: data.id,
      participant_id: null,
      credential_version: data.credential_version,
      expires_at: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(),
    });
  if (sessionError) throw new Error('Staff sign-in could not be saved.');
  return token;
}

export async function myRegistration() {
  const jar = await cookies();
  const session = await getSession(
    jar.get('oak-session')?.value || jar.get('oak_participant_session')?.value,
  );
  if (!session?.participant_id) return null;
  const { data, error } = await adminClient()
    .from('participants')
    .select('*,checkins(check_in_time)')
    .eq('id', session.participant_id)
    .maybeSingle();
  if (error) throw new Error('Registration could not be loaded.');
  if (!data || data.credential_version !== session.credential_version) return null;
  return participant(data);
}

export async function revokeRegistrationSession(token: string | undefined) {
  if (!validToken(token)) return;
  const { error } = await adminClient()
    .from('auth_sessions')
    .delete()
    .in('token_hash', hashes(token));
  if (error) throw new Error('Sign-out could not be completed.');
}

export async function register(
  input: Omit<Registration, 'id' | 'code' | 'createdAt' | 'checkedInAt'>,
) {
  if (input.role === 'Coordination Team' && !(await staffUser()))
    throw new Error('Sign in with your approved Coordination Team account at /staff.');
  const token = newToken();
  const registrationId = 'OAK-2026-' + randomBytes(16).toString('hex').toUpperCase();
  const row = {
    registration_id: registrationId,
    qr_code_id: input.role === 'Partner' ? registrationId : null,
    first_name: input.firstName,
    last_name: input.lastName,
    organization: input.organisation,
    sub_partner_program_area: input.programmeArea,
    role: input.role,
    email: input.email.trim().toLowerCase(),
    phone: input.phone,
    dietary_requirements: input.dietary,
    accessibility_requirements: input.accessibility,
    travel_requirements: input.travel,
    accommodation_requirements: input.accommodation || '',
    consent: input.consent,
  };
  // Reuse the project's existing transaction so participant and session creation commit together.
  const { data, error } = await adminClient().rpc('register_participant', {
    payload: row,
    session_hash: sessionHash(token),
    recovery_hash: sessionHash(newToken()),
    session_expires: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(),
    old_session_hashes: [],
  });
  if (error?.code === '23505')
    throw new Error(
      'This email is already registered. Use your saved pass or contact event staff.',
    );
  if (error || !data?.id) throw new Error('Registration could not be saved. Please try again.');
  return {
    ...input,
    id: data.id as string,
    email: row.email,
    code: row.qr_code_id || '',
    sessionToken: token,
    createdAt: new Date().toISOString(),
    checkedInAt: null,
  };
}

export async function allRegistrations(): Promise<Registration[]> {
  const { data, error } = await adminClient()
    .from('participants')
    .select('*,checkins(check_in_time)')
    .order('registration_date', { ascending: false });
  if (error) throw new Error('Attendance could not be loaded.');
  return (data || []).map(participant);
}

export async function findRegistration(code: string): Promise<Registration | null> {
  const { data, error } = await adminClient()
    .from('participants')
    .select('*,checkins(check_in_time)')
    .eq('qr_code_id', code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw new Error('Registration could not be verified.');
  return data ? participant(data) : null;
}

export async function checkIn(code: string) {
  const entry = await findRegistration(code);
  if (!entry || entry.role !== 'Partner') return null;
  const client = adminClient();
  const day = eventDate();
  const { data: previous, error: lookupError } = await client
    .from('checkins')
    .select('check_in_time')
    .eq('participant_id', entry.id)
    .eq('check_in_date', day)
    .maybeSingle();
  if (lookupError) throw new Error('Attendance could not be verified.');
  if (previous)
    return { registration: { ...entry, checkedInAt: previous.check_in_time }, already: true };
  const { data, error } = await client
    .from('checkins')
    .insert({
      participant_id: entry.id,
      check_in_date: day,
      check_in_time: new Date().toISOString(),
      attendance_status: 'checked_in',
    })
    .select('check_in_time')
    .single();
  if (error?.code === '23505') {
    const { data: existing, error: readError } = await client
      .from('checkins')
      .select('check_in_time')
      .eq('participant_id', entry.id)
      .eq('check_in_date', day)
      .single();
    if (readError || !existing) throw new Error('Check-in could not be confirmed.');
    return { registration: { ...entry, checkedInAt: existing.check_in_time }, already: true };
  }
  if (error || !data) throw new Error('Check-in could not be saved. Please try again.');
  return { registration: { ...entry, checkedInAt: data.check_in_time }, already: false };
}

function noteFromRow(row: Row, sessionDays: Map<string, number>): Note {
  return {
    id: text(row, 'id'),
    ownerId: text(row, 'participant_id') || text(row, 'admin_id'),
    sessionId: text(row, 'session_id'),
    text: text(row, 'note_text'),
    name: '',
    organisation: '',
    day: sessionDays.get(text(row, 'session_id')) || 1,
    time: new Date(text(row, 'updated_at') || text(row, 'created_at')).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Harare',
    }),
  };
}

export async function content(ownerId?: string) {
  const client = adminClient();
  const [p, s, n] = await Promise.all([
    client.from('partners').select('*').order('name'),
    client.from('sessions').select('*').order('day').order('start_time'),
    ownerId
      ? client
          .from('session_notes')
          .select('*')
          .or(`participant_id.eq.${ownerId},admin_id.eq.${ownerId}`)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (p.error || s.error || n.error) throw new Error('Event content could not be loaded.');
  const dates = [...new Set((s.data || []).map((row) => text(row, 'day')))].sort();
  const mappedSessions: Session[] = (s.data || []).map((row) => ({
    id: text(row, 'id'),
    day: dates.indexOf(text(row, 'day')) + 1,
    time: text(row, 'start_time').slice(0, 5),
    end: text(row, 'end_time').slice(0, 5),
    title: text(row, 'title'),
    speaker: text(row, 'speaker'),
    venue: text(row, 'venue'),
    description: text(row, 'description'),
    type: 'Plenary',
  }));
  const sessionDays = new Map(mappedSessions.map((row) => [row.id, row.day]));
  const mappedPartners: Partner[] = (p.data || []).map((row) => ({
    id: text(row, 'id'),
    name: text(row, 'name'),
    initials: initials(text(row, 'name')),
    region: text(row, 'region'),
    category: 'Partner',
    tags: text(row, 'areas_of_work')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    since: typeof row.partner_since === 'number' ? row.partner_since : 2026,
    website: text(row, 'website_url')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, ''),
    about: text(row, 'description'),
    contact: text(row, 'contact_name'),
    email: text(row, 'contact_email'),
  }));
  return {
    partners: mappedPartners,
    sessions: mappedSessions,
    notes: (n.data || []).map((row) => noteFromRow(row, sessionDays)),
  };
}

export async function addNote(
  input: Omit<Note, 'id' | 'time'>,
  ownerType: 'participant' | 'admin',
) {
  if (!input.ownerId || !input.sessionId) throw new Error('A note owner and session are required.');
  const { data, error } = await adminClient()
    .from('session_notes')
    .insert({
      id: randomUUID(),
      session_id: input.sessionId,
      note_text: input.text,
      participant_id: ownerType === 'participant' ? input.ownerId : null,
      admin_id: ownerType === 'admin' ? input.ownerId : null,
    })
    .select('*')
    .single();
  if (error?.code === '23505')
    throw new Error('You already have a note for this session. Edit your existing note.');
  if (error) {
    console.error('Supabase session note save failed', { code: error.code });
    throw new Error('Your note could not be saved.');
  }
  return {
    ...noteFromRow(data, new Map()),
    day: input.day,
    name: input.name,
    organisation: input.organisation,
  };
}

export async function updateNote(id: string, ownerId: string, input: Omit<Note, 'id' | 'time'>) {
  const { data, error } = await adminClient()
    .from('session_notes')
    .update({
      note_text: input.text,
      session_id: input.sessionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .or(`participant_id.eq.${ownerId},admin_id.eq.${ownerId}`)
    .select('*')
    .maybeSingle();
  if (error) throw new Error('Your note could not be saved.');
  if (!data) throw new Error('Note not found.');
  return {
    ...noteFromRow(data, new Map()),
    day: input.day,
    name: input.name,
    organisation: input.organisation,
  };
}
