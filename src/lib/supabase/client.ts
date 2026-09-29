'use client';
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'dummy-key';
  return createBrowserClient(url, key);
}
