import { NextRequest, NextResponse } from 'next/server';
import { registrationSchema } from '@/lib/validation';
import { register, recordEmailStatus } from '@/lib/repository';
import { sendConfirmation } from '@/lib/confirmation-email';
import { secretMatches } from '@/lib/security';
import { guard, fail, rateLimit, RateLimitError } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    guard(request);
    rateLimit(request, 'register', 10, 15 * 60 * 1000);

    const parsed = registrationSchema.safeParse(await request.json());
    if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? 'Invalid form.'));

    const { staffAccessCode, staff_access_code, ...input } = parsed.data;

    // Optional gate for the Coordination Team role. Only enforced when STAFF_ACCESS_CODE is set.
    if (
      input.role === 'Coordination Team' &&
      !secretMatches(staffAccessCode ?? staff_access_code ?? '', process.env.STAFF_ACCESS_CODE)
    )
      return fail(new Error('That staff access code is not correct.'), 403);

    const entry = await register(input);

    // Partners get the QR email; other roles return 'not-applicable'.
    await recordEmailStatus(entry, await sendConfirmation(entry));

    const { sessionToken, ...registration } = entry;
    const response = NextResponse.json({ registration }, { status: 201 });
    response.cookies.set('oak-session', sessionToken!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (e) {
    return fail(e, e instanceof RateLimitError ? 429 : 400);
  }
}
