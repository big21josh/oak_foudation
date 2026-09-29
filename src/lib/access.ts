import 'server-only';
import { redirect } from 'next/navigation';
import { myRegistration, staffUser } from './repository';
export async function currentRole() {
  if (await staffUser()) return 'Coordination Team';
  return (await myRegistration())?.role ?? null;
}
export async function requirePage(roles: string[]) {
  const role = await currentRole();
  if (!role) redirect('/');
  if (!roles.includes(role)) redirect(role === 'Partner' ? '/qr-code' : '/programme');
}
export const programmeRoles = ['OAK Staff', 'Coordination Team', 'Presenter', 'Observer'];
