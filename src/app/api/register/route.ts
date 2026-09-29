import { NextRequest, NextResponse } from 'next/server';
import { registrationSchema } from '@/lib/validation';
import { register, recordEmailStatus } from '@/lib/repository';
import { guard, fail, rateLimit, RateLimitError } from '@/lib/api';
import { sendConfirmation } from '@/lib/confirmation-email';
import { secretMatches } from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    guard(request);
    rateLimit(request, 'registration', 8, 10 * 60 * 1000);
    if (Number(request.headers.get('content-length') ?? 0) > 16000)
      return fail(new Error('Form is too large.'), 413);

    const body = await request.json();
    if (body.website) return fail(new Error('Unable to submit form.'));

    const parsed = registrationSchema.safeParse(body);
    if (!parsed.success) return fail(new Error(parsed.error.issues[0].message));

    const { staffAccessCode, staff_access_code, ...registrationInput } = parsed.data;
    if (
      ['OAK Staff', 'Coordination Team'].includes(registrationInput.role) &&
      !secretMatches(staffAccessCode ?? staff_access_code ?? '', process.env.STAFF_ACCESS_CODE)
    ) {
      return fail(new Error('A valid staff access code is required for this role.'), 403);
    }

    const registration = await register(registrationInput);
    const emailStatus = await sendConfirmation(registration);
    await recordEmailStatus(registration, emailStatus);

    const response = NextResponse.json(
      { registration: { ...registration, sessionToken: undefined } },
      { status: 201 },
    );

    const cookieOptions = {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
    };

    if (registration.sessionToken) {
      response.cookies.set('oak-session', registration.sessionToken, cookieOptions);
      response.cookies.set('oak_participant_session', registration.sessionToken, cookieOptions);
    }

    return response;
  } catch (e) {
    return fail(e, e instanceof RateLimitError ? 429 : 400);
  }
}
