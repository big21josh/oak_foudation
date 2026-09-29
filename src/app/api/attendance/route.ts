import { NextRequest, NextResponse } from 'next/server';
import { allRegistrations } from '@/lib/repository';
import { guard, fail, requireStaff } from '@/lib/api';
export async function GET(request: NextRequest) {
  try {
    guard(request);
    await requireStaff();
    const registrations = await allRegistrations();
    return NextResponse.json(
      {
        registrations: registrations.map(
          ({ id, firstName, lastName, organisation, role, createdAt, checkedInAt }) => ({
            id,
            firstName,
            lastName,
            organisation,
            role,
            createdAt,
            checkedInAt,
          }),
        ),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return fail(e, 403);
  }
}
