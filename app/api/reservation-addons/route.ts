import { NextResponse } from "next/server";
import { getReservationAddons } from "@/lib/reservation-addons";

export async function GET() {
  try {
    return NextResponse.json({ addons: await getReservationAddons({ activeOnly: true }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load reservation extras." }, { status: 500 });
  }
}
