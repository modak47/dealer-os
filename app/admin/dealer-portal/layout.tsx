import { redirect } from "next/navigation";
import { requireWebsiteLeadStaff } from "@/lib/auth/website-lead-staff";
export default async function DealerPortalAdminLayout({ children }: { children: React.ReactNode }) {
  if (!await requireWebsiteLeadStaff(true)) redirect("/admin?access=staff-required");
  return children;
}
