import { NextResponse } from "next/server";
import { saveDraft } from "../../../lib/marketplace";
import { normaliseRegistration } from "../../../lib/text";
import { lookupByRegistration, VehicleLookupError } from "../../../lib/vehicle-provider";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { registration?: unknown };
    const registration = normaliseRegistration(body.registration);
    const vehicle = await lookupByRegistration(registration);
    await saveDraft({ currentStep: 1, registration, vehicle: { ...vehicle, lookupState: "success" } });
    return NextResponse.json({ vehicle });
  } catch (error) {
    if (error instanceof VehicleLookupError) {
      await saveDraft({ currentStep: 1, registration: "", vehicle: { lookupState: error.code, lookupError: error.message } }).catch(() => null);
      const expected = ["provider_unavailable", "licensing_blocked", "not_found"].includes(error.code);
      return NextResponse.json({ error: error.message, code: error.code }, { status: expected ? 200 : error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Vehicle lookup failed.", code: "provider_unavailable" });
  }
}
