import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guard, fail, rateLimit, RateLimitError } from '@/lib/api';
import { databaseSchema } from '@/lib/supabase/schema';
import { isConfigured } from '@/lib/supabase/config';
import { signInAdmin } from '@/lib/participant-repository';
import { SESSION_MAX_AGE } from '@/lib/security';
import { sessionHash } from '@/lib/security';
import { adminClient } from '@/lib/supabase/admin';

const credentials = z.object({
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  try {
    guard(request);
    rateLimit(request, 'staff-sign-in', 5, 15 * 60 * 1000);
    if (!isConfigured() || (await databaseSchema()) !== 'participants')
      return fail(new Error('Staff username sign-in is unavailable.'), 404);
    const address =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const quota = await adminClient().rpc('take_rate_limit', {
      bucket: `staff-sign-in:${sessionHash(address)}`,
      max_hits: 5,
      window_seconds: 900,
    });
    if (quota.error) throw new Error('Staff sign-in is temporarily unavailable.');
    if (!quota.data) throw new RateLimitError();
    const parsed = credentials.safeParse(await request.json());
    if (!parsed.success) return fail(new Error('Enter your staff username and password.'));
    const token = await signInAdmin(parsed.data.username, parsed.data.password);
    if (!token) return fail(new Error('The staff username or password is incorrect.'), 401);
    const response = NextResponse.json({ ok: true });
    response.cookies.set('oak_admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    return fail(error, error instanceof RateLimitError ? 429 : 400);
  }
}
