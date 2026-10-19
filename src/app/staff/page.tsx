import { redirect } from 'next/navigation';
import { StaffLogin } from '@/components/staff-login';
import { staffUser } from '@/lib/repository';
import { isConfigured } from '@/lib/supabase/config';
import { databaseSchema } from '@/lib/supabase/schema';
export const metadata = { title: 'Staff sign-in' };
export default async function Page() {
  if (isConfigured() && (await staffUser())) redirect('/attendance');
  return (
    <StaffLogin
      demo={!isConfigured()}
      databaseAccounts={isConfigured() && (await databaseSchema()) === 'participants'}
    />
  );
}
