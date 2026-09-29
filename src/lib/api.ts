import { NextRequest, NextResponse } from 'next/server';
import { isConfigured } from './supabase/config';
import { staffUser } from './repository';
import { currentRole } from './access';

type RateWindow = { hits: number[] };
const runtime = globalThis as typeof globalThis & { oakRateLimits?: Map<string, RateWindow> };

export class RateLimitError extends Error {
  constructor() {
    super('Too many attempts. Please wait a few minutes and try again.');
  }
}

function clientAddress(request: NextRequest) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
export function fail(error: unknown, status = 400) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Something went wrong. Please try again.' },
    { status },
  );
}
export function guard(request: NextRequest) {
  if (!isConfigured() && !['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname))
    throw new Error('Connect Supabase before using this app on a public host.');
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.headers.get('host'))
    throw new Error('Request origin is not allowed.');
}

/** A per-instance sliding-window limit for endpoints that create event records. */
export function rateLimit(request: NextRequest, bucket: string, limit: number, windowMs: number) {
  const now = Date.now();
  const key = `${bucket}:${clientAddress(request)}`;
  const limits = (runtime.oakRateLimits ??= new Map());
  const window = limits.get(key) ?? { hits: [] };
  window.hits = window.hits.filter((hit) => hit > now - windowMs);
  if (window.hits.length >= limit) {
    limits.set(key, window);
    throw new RateLimitError();
  }
  window.hits.push(now);
  limits.set(key, window);

  // Bound the process-local cache in long-running local or server processes.
  if (limits.size > 500) {
    for (const [storedKey, storedWindow] of limits) {
      if (!storedWindow.hits.some((hit) => hit > now - windowMs)) limits.delete(storedKey);
    }
  }
}
export async function requireStaff() {
  if ((await currentRole()) !== 'Coordination Team')
    throw new Error('Coordination Team access is required.');
}
