import { AdminShell } from "@/app/admin/admin-shell";
import { getAdminIdentity } from "@/lib/admin-identity";
import { requireWebsiteLeadStaff } from "@/lib/auth/website-lead-staff";
import { redirect } from "next/navigation";

export default async function WebsiteLeadsLayout({ children }: { children: React.ReactNode }) {
  if (!await requireWebsiteLeadStaff(true)) redirect("/admin?next=/website-leads&access=staff-required");
  const identity = await getAdminIdentity();
  return <AdminShell identity={identity}>{children}</AdminShell>;
}
