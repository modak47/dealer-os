import "server-only";
import { headers } from "next/headers";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { isVisualTestRequest } from "@/lib/visual-test-mode";

export async function requireWebsiteLeadStaff(allowVisualRead = false) {
  // Only read-only rendering may use the existing development-only visual header.
  if (allowVisualRead && isVisualTestRequest(new Headers(await headers()))) return { id: "visual-test" };
  return requireStaffUser();
}
