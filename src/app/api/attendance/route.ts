import { NextRequest, NextResponse } from 'next/server';
import { allRegistrations } from '@/lib/repository';
import { currentRole, attendanceRoles } from '@/lib/access';
import { guard, fail } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    guard(request);

    const role = await currentRole();

    if (!attendanceRoles.includes(role ?? '')) {
      return fail(
        new Error('Coordination Team access is required.'),
        403,
      );
    }

    const registrations = (await allRegistrations()).map(
      ({
        id,
        firstName,
        lastName,
        organisation,
        role,
        createdAt,
        checkedInAt,
      }) => ({
        id,
        firstName,
        lastName,
        organisation,
        role,
        createdAt,
        checkedInAt,
      }),
    );

    return NextResponse.json(
      { registrations },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (e) {
    return fail(e);
  }
}