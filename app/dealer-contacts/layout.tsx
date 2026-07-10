import { AdminShell } from "@/app/admin/admin-shell";
import { getAdminIdentity } from "@/lib/admin-identity";

export default async function DealerContactsLayout({ children }: { children: React.ReactNode }) {
  const identity = await getAdminIdentity();
  return <AdminShell identity={identity}>{children}</AdminShell>;
}
