import { NextRequest, NextResponse } from 'next/server';
import { codeSchema } from '@/lib/validation';
import { checkIn } from '@/lib/repository';
import { guard, fail, requireStaff } from '@/lib/api';
export async function POST(request: NextRequest) {
  try {
    guard(request);
    await requireStaff();
    const { code } = await request.json();
    const parsed = codeSchema.safeParse(code);
    if (!parsed.success) return NextResponse.json({ unrecognised: true }, { status: 404 });
    const result = await checkIn(parsed.data);
    if (!result) return NextResponse.json({ unrecognised: true }, { status: 404 });
    return NextResponse.json({
      ...result,
      registration: { ...result.registration, sessionToken: undefined },
    });
  } catch (e) {
    return fail(e, 403);
  }
}
