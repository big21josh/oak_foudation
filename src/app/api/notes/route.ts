import { NextRequest, NextResponse } from 'next/server';
import { currentRole, programmeRoles } from '@/lib/access';
import { addNote, updateNote, myRegistration, staffUser } from '@/lib/repository';
import { noteSchema } from '@/lib/validation';
import { guard, fail } from '@/lib/api';
import { z } from 'zod';

// The owner is always taken from the server-side session, never from the request body.
const bodySchema = noteSchema
  .omit({ name: true, organisation: true })
  .extend({ id: z.string().min(1).max(160).optional() });

export async function POST(request: NextRequest) {
  try {
    guard(request);
    if (!programmeRoles.includes((await currentRole()) ?? ''))
      return fail(new Error('Programme access is required.'), 403);

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? 'Invalid note.'));
    const { id, ...fields } = parsed.data;

    const registration = await myRegistration();
    const staff = registration ? null : await staffUser();
    const ownerId = registration?.id ?? staff?.id;
    if (!ownerId) return fail(new Error('Register or sign in to save notes.'), 401);

    const input = {
      ...fields,
      ownerId,
      name: registration ? `${registration.firstName} ${registration.lastName}` : 'Coordination Team',
      organisation: registration?.organisation ?? 'OAK Foundation',
    };

    const note = id
      ? await updateNote(id, ownerId, input)
      : await addNote(input, registration ? 'participant' : 'admin');
    return NextResponse.json({ note });
  } catch (e) {
    return fail(e);
  }
}
