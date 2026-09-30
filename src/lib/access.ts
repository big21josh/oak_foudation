import 'server-only';

import { redirect } from 'next/navigation';
import { myRegistration, staffUser } from './repository';

export const qrRoles = [
  'Partner',
];

export const programmeRoles = [
  'OAK Staff',
  'Presenter',
  'Observer',
  'Coordination Team',
];

export const partnersRoles = [
  'OAK Staff',
  'Presenter',
  'Observer',
  'Coordination Team',
];

export const checkInRoles = [
  'Coordination Team',
];

export const attendanceRoles = [
  'Coordination Team',
];

export async function currentRole() {
  // Staff authentication represents the Coordination Team.
  if (await staffUser()) {
    return 'Coordination Team';
  }

  // Registered participants get their selected registration role.
  return (await myRegistration())?.role ?? null;
}

export async function requirePage(roles: string[]) {
  const role = await currentRole();

  // No authenticated/registered user.
  if (!role) {
    redirect('/');
  }

  // User does not have permission for this page.
  if (!roles.includes(role)) {
    // Partners can only access their QR page.
    if (role === 'Partner') {
      redirect('/qr-code');
    }

    // All other registered roles that are denied access
    // are sent to the Programme page.
    redirect('/programme');
  }

  return role;
}