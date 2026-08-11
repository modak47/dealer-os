import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { AutotraderVehicleLookupError, lookupVehicleByVrm } from "@/lib/autotrader-vehicle-lookup";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
    await applyAdvertFallback(vehicle);
    return NextResponse.json({ vehicle });
  } catch (error) {
    if (error instanceof AutotraderVehicleLookupError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Auto Trader vehicle lookup failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Auto Trader vehicle lookup failed.", code: "autotrader_error" }, { status: 502 });
  }
}

async function applyAdvertFallback(vehicle: Awaited<ReturnType<typeof lookupVehicleByVrm>>) {
  const registration = String(vehicle.registration ?? "").replace(/\s+/g, "").toUpperCase();
  if (!registration && (!vehicle.make || !vehicle.model || !vehicle.year)) return;
  try {
    const db = getSupabaseAdmin();
    let data: Record<string, unknown> | null = null;
    if (registration) {
      const result = await db
        .from("autotrader_listings")
        .select("*")
        .eq("Reg Number", registration)
        .not("HPI Category", "is", null)
        .neq("HPI Category", "")
        .order("Last Seen Date", { ascending: false })
        .limit(1)
        .maybeSingle();
      data = result.data as Record<string, unknown> | null;
    }
    if (!data && vehicle.make && vehicle.year) {
      const { data: candidates } = await db
        .from("autotrader_listings")
        .select("*")
        .eq("Make", vehicle.make)
        .eq("Year", String(vehicle.year))
        .not("HPI Category", "is", null)
        .neq("HPI Category", "")
        .order("Last Seen Date", { ascending: false })
        .limit(50);
      data = bestAdvertMatch(vehicle, candidates ?? []);
    }
    const category = text(data?.["HPI Category"]);
    if (!category) return;
    vehicle.vehicleCheck = {
      ...(vehicle.vehicleCheck ?? {
        status: "Vehicle check returned",
        clear: null,
        category: "",
        outstandingFinance: null,
        privateFinance: null,
        tradeFinance: null,
        mileageDiscrepancy: null,
        highRisk: null,
        stolen: null,
        scrapped: null,
        exported: null,
        imported: null,
        writtenOff: null,
        colourChanged: null,
        plateChanges: null,
        previousOwners: null,
        motExpiry: vehicle.motExpiry ?? "",
        motStatus: vehicle.motExpiry ? "MOT date returned" : "",
        reportUrl: "",
        raw: {},
      }),
      status: `Category ${category}`,
      clear: false,
      category,
      writtenOff: true,
      raw: {
        ...(vehicle.vehicleCheck?.raw ?? {}),
        advertFallback: {
          hpiCategory: category,
          sourceUrl: text(data?.["Source URL"]),
          lastSeenDate: text(data?.["Last Seen Date"]),
        },
      },
    };
    vehicle.history = { ...(typeof vehicle.history === "object" && vehicle.history ? vehicle.history as Record<string, unknown> : {}), advertHpiCategory: category };
    vehicle.taxonomyData = { ...(vehicle.taxonomyData ?? {}), advertFallback: { hpiCategory: category, sourceUrl: text(data?.["Source URL"]) } };
    if (!vehicle.vin && text(data?.VIN)) vehicle.vin = text(data?.VIN);
  } catch (error) {
    console.warn("Auto Trader advert fallback lookup failed", error);
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function bestAdvertMatch(vehicle: Awaited<ReturnType<typeof lookupVehicleByVrm>>, rows: Record<string, unknown>[]) {
  const vehicleModel = normalise(text(vehicle.model));
  const vehicleDerivative = normalise(text(vehicle.derivative));
  const matches = rows.filter(row => {
    const rowModel = normalise(text(row.Model));
    const rowVariant = normalise(text(row.Variant));
    const rowText = `${rowModel} ${rowVariant}`.trim();
    if (!rowText || !vehicleModel) return false;
    return rowText.includes(vehicleModel) || vehicleModel.includes(rowModel) || rowText.split(" ").every(token => vehicleDerivative.includes(token));
  });
  if (matches.length === 1) return matches[0];
  const categories = new Set(matches.map(row => text(row["HPI Category"])).filter(Boolean));
  return matches.length > 0 && categories.size === 1 ? matches[0] : null;
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
