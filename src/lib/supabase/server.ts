import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseUrl, getSupabaseKey } from './config';

export async function createClient() {
  const jar = await cookies();
  const url = getSupabaseUrl() || 'http://localhost:54321';
  const key = getSupabaseKey() || 'dummy-key';
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
