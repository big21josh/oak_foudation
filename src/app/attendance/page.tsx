import { requirePage, attendanceRoles } from '@/lib/access';
import { Attendance } from '@/components/attendance';
import { allRegistrations } from '@/lib/repository';

export const metadata = {
  title: 'Attendance',
};

export default async function Page() {
  await requirePage(attendanceRoles);

  const people = await allRegistrations();

  return (
    <Attendance
      initial={people.map(
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
      )}
    />
  );
}