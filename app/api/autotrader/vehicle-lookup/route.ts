import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { AutotraderVehicleLookupError, lookupVehicleByVrm } from "@/lib/autotrader-vehicle-lookup";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await requireStaffUser())) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON.", code: "invalid_json" }, { status: 400 });
  }

  const vrm = body && typeof body === "object" && "vrm" in body ? (body as { vrm?: unknown }).vrm : "";
  if (typeof vrm !== "string" || !vrm.trim()) return NextResponse.json({ error: "VRM is required.", code: "invalid_vrm" }, { status: 400 });

  try {
    const vehicle = await lookupVehicleByVrm(vrm);
    return NextResponse.json({ vehicle });
  } catch (error) {
    if (error instanceof AutotraderVehicleLookupError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Auto Trader vehicle lookup failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Auto Trader vehicle lookup failed.", code: "autotrader_error" }, { status: 502 });
  }
}
