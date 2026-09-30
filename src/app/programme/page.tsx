import { requirePage, programmeRoles } from '@/lib/access';
import { Programme } from '@/components/programme';
import { content, myRegistration, staffUser } from '@/lib/repository';

export const metadata = {
  title: 'Programme',
};

export default async function Page() {
  await requirePage(programmeRoles);

  const ownerId =
    (await myRegistration())?.id ??
    (await staffUser())?.id;

  const data = await content(ownerId);

  return (
    <Programme
      sessions={data.sessions}
      initialNotes={data.notes}
    />
  );
}