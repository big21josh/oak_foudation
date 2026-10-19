import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseUrl, getSupabasePublicKey } from './config';

export async function createClient() {
  const jar = await cookies();
  const url = getSupabaseUrl() || 'http://localhost:54321';
  const key = getSupabasePublicKey();
  if (!key) throw new Error('Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for staff sign-in.');
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          /* Server Component cookies are refreshed by proxy. */
        }
      },
    },
  });
}
