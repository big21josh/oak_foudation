import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseKey } from './config';

let cachedClient: SupabaseClient | undefined;

export function adminClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) {
    throw new Error('Supabase server credentials are not configured. Complete .env.local setup.');
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}
