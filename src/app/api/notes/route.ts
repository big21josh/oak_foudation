import { NextRequest, NextResponse } from 'next/server';
import { addNote, updateNote, myRegistration, staffUser, content } from '@/lib/repository';
import { currentRole, programmeRoles } from '@/lib/access';
import { noteSchema } from '@/lib/validation';
import { guard, fail } from '@/lib/api';
export async function POST(request: NextRequest) {
  try {
    guard(request);
    if (!programmeRoles.includes((await currentRole()) ?? ''))
      return fail(new Error('Register with an eligible role to use personal notes.'), 403);
    const attendee = await myRegistration();
    const staff = await staffUser();
    const ownerId = attendee?.id ?? staff!.id;
    const body = await request.json();
    body.name = attendee ? `${attendee.firstName} ${attendee.lastName}` : 'Coordination Team';
    body.organisation = attendee?.organisation ?? 'OAK Foundation';
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) return fail(new Error(parsed.error.issues[0].message));
    const session = (await content()).sessions.find((s) => s.id === parsed.data.sessionId);
    if (!session) return fail(new Error('Select a valid session.'));
    const input = { ...parsed.data, day: session.day, ownerId };
    const note = body.id
      ? await updateNote(String(body.id), ownerId, input)
      : await addNote(input, attendee ? 'participant' : 'admin');
    return NextResponse.json({ note });
  } catch (e) {
    return fail(e);
  }
}
