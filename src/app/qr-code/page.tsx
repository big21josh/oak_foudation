import { requirePage } from '@/lib/access';
import { myRegistration } from '@/lib/repository';
import { RegistrationPage } from '@/components/registration';

export const metadata = { title: 'My QR Code' };

export default async function Page() {
  await requirePage(['Partner']);
  const entry = await myRegistration();
  if (!entry) return <RegistrationPage initial={null} />;
  // Never send the session token to the browser.
  const { sessionToken, ...safe } = entry;
  return <RegistrationPage initial={safe} />;
}
