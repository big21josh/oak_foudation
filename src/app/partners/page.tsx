import { requirePage, partnersRoles } from '@/lib/access';
import { PartnerDirectory } from '@/components/partners';
import { content } from '@/lib/repository';
export const metadata = { title: 'Partner Directory' };
export default async function Page() {
  await requirePage(partnersRoles);
  return <PartnerDirectory partners={(await content()).partners} />;
}
