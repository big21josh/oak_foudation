import { NextRequest, NextResponse } from 'next/server';
import { checkIn, allRegistrations } from '@/lib/repository';
import { currentRole, checkInRoles } from '@/lib/access';
import { codeSchema } from '@/lib/validation';
import { guard, fail } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    guard(request);

    const role = await currentRole();

    if (!checkInRoles.includes(role ?? '')) {
      return fail(
        new Error('Coordination Team access is required.'),
        403,
      );
    }

    const body = await request.json();

    // Scanner / manual code entry send `code`.
    // Manual Search sends the participant `id`.
    const raw =
      typeof body?.id === 'string'
        ? (await allRegistrations()).find((r) => r.id === body.id)?.code
        : body?.code;

    const code = codeSchema.safeParse(raw);

    if (!code.success) {
      return NextResponse.json(
        { unrecognised: true },
        { status: 404 },
      );
    }

    const result = await checkIn(code.data);

    if (!result) {
      return NextResponse.json(
        { unrecognised: true },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ...result,
      registration: {
        ...result.registration,
        sessionToken: undefined,
      },
    });
  } catch (e) {
    return fail(e);
  }
}