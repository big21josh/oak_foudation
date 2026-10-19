import 'server-only';
import { adminClient } from './admin';

export type DatabaseSchema = 'registrations' | 'participants';
let detected: DatabaseSchema | undefined;
let pending: Promise<DatabaseSchema> | undefined;

export async function databaseSchema(): Promise<DatabaseSchema> {
  if (detected) return detected;
  if (!pending) pending = detect();
  try {
    detected = await pending;
    return detected;
  } finally {
    pending = undefined;
  }
}

async function detect(): Promise<DatabaseSchema> {
  const client = adminClient();
  const registrations = await client.from('registrations').select('id').limit(0);
  if (!registrations.error) return 'registrations';
  // Only a missing table permits schema discovery; credentials/network failures stay errors.
  if (registrations.error.code !== 'PGRST205')
    throw new Error('Unable to verify the event database configuration.');
  const participants = await client.from('participants').select('id').limit(0);
  if (participants.error)
    throw new Error('The configured Supabase project does not expose a supported event database.');
  return 'participants';
}
