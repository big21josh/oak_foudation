import { requirePage, checkInRoles } from '@/lib/access';
import { CheckIn } from '@/components/check-in';
import { content } from '@/lib/repository';
import { isConfigured } from '@/lib/supabase/config';

export const metadata = {
  title: 'Event Check-In',
};

export default async function Page() {
  await requirePage(checkInRoles);

  const { sessions } = await content();

  return (
    <CheckIn
      demo={!isConfigured()}
      sessions={sessions}
    />
  );
}