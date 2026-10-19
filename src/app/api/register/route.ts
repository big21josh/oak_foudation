import { NextRequest, NextResponse } from 'next/server';
import { registrationSchema } from '@/lib/validation';
import { register, recordEmailStatus, staffUser } from '@/lib/repository';
import { sendConfirmation } from '@/lib/confirmation-email';
import { SESSION_MAX_AGE } from '@/lib/security';
import { isConfigured } from '@/lib/supabase/config';
import { guard, fail, rateLimit, RateLimitError } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    guard(request);
    rateLimit(request, 'register', 10, 15 * 60 * 1000);

    const parsed = registrationSchema.safeParse(await request.json());
    if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? 'Invalid form.'));

    const input = parsed.data;

    // Live staff permissions require a verified account, never a self-selected role.
    if (input.role === 'Coordination Team' && isConfigured() && !(await staffUser()))
      return fail(
        new Error('Sign in with your approved Coordination Team account at /staff.'),
        403,
      );

    const entry = await register(input);

    // Partners get the QR email; other roles return 'not-applicable'.
    const emailStatus = await sendConfirmation(entry);
    try {
      await recordEmailStatus(entry, emailStatus);
    } catch {
      // Registration is already committed; a metadata error must not strand the saved session.
      console.error('Unable to persist registration email status.');
    }

    const { sessionToken, ...registration } = entry;
    const response = NextResponse.json({ registration }, { status: 201 });
    response.cookies.set('oak-session', sessionToken!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (e) {
    return fail(e, e instanceof RateLimitError ? 429 : 400);
  }
}
