import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard, fail } from '@/lib/api';
import { revokeRegistrationSession } from '@/lib/repository';
import { isConfigured } from '@/lib/supabase/config';
import { databaseSchema } from '@/lib/supabase/schema';
export async function POST(request: NextRequest) {
  try {
    guard(request);
    for (const name of ['oak-session', 'oak_participant_session', 'oak_admin_session']) {
      await revokeRegistrationSession(request.cookies.get(name)?.value);
    }
    if (isConfigured() && (await databaseSchema()) === 'registrations') {
      const client = await createClient();
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new Error('Staff sign-out could not be completed. Please try again.');
    }
    const response = NextResponse.json({ ok: true });
    for (const name of ['oak-session', 'oak_participant_session', 'oak_admin_session']) {
      response.cookies.set(name, '', {
        path: '/',
        maxAge: 0,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
    }
    return response;
  } catch (e) {
    return fail(e);
  }
}
