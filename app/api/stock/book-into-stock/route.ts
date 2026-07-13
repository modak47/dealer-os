import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { bookMotorcycleIntoStock } from "@/lib/stock-booking";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const result = await bookMotorcycleIntoStock(body);
    return NextResponse.json({ booking: result }, { status: result.existing ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to book motorcycle into stock." }, { status: 400 });
  }
}
