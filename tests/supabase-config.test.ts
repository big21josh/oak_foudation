import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupabaseKey, getSupabaseUrl, isConfigured } from '../src/lib/supabase/config';

test('server configuration accepts either secret alias and never uses a public credential for admin operations', () => {
  const names = [
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
    assert.equal(getSupabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(getSupabaseKey(), undefined);
    assert.equal(isConfigured(), false);
    process.env.SUPABASE_SECRET_KEY = 'secret-test-key';
    assert.equal(getSupabaseKey(), 'secret-test-key');
    assert.equal(isConfigured(), true);
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
    assert.equal(getSupabaseKey(), 'service-test-key');
    process.env.SUPABASE_URL = 'https://server.example.supabase.co';
    assert.equal(getSupabaseUrl(), process.env.SUPABASE_URL);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
