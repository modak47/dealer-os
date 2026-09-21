import { requireWebsiteLeadStaff } from "@/lib/auth/website-lead-staff";
import { NextResponse } from "next/server";
import { serveLeadImage } from "@/lib/lead-image-server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!await requireWebsiteLeadStaff(true)) return NextResponse.json({ error: "Staff access required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  return serveLeadImage(request);
}
