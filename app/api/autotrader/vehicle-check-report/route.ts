import { NextResponse } from "next/server";
import { autotraderFetch, getAutotraderConfig } from "@/lib/autotrader";
import { requireStaffUser } from "@/lib/auth/require-staff";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireStaffUser())) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const reportUrl = new URL(request.url).searchParams.get("url") ?? "";
  if (!reportUrl) return NextResponse.json({ error: "Report URL is required." }, { status: 400 });

  try {
    const config = getAutotraderConfig();
    const parsed = new URL(reportUrl);
    const apiUrl = new URL(config.apiUrl);
    if (parsed.origin !== apiUrl.origin || !parsed.pathname.startsWith("/vehicles/vehicle-check-report/")) {
      return NextResponse.json({ error: "Invalid AutoTrader report URL." }, { status: 400 });
    }

    const response = await autotraderFetch(`${parsed.pathname}${parsed.search}`);
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load AutoTrader report." }, { status: 502 });
  }
}
