import { NextResponse } from "next/server";
import { cleanAddonInput, getReservationAddons, type ReservationAddonInput } from "@/lib/reservation-addons";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    return NextResponse.json({ addons: await getReservationAddons() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load reservation extras." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ReservationAddonInput;
    const payload = cleanAddonInput(body);
    const { data, error } = await getSupabaseAdmin().from("reservation_addons").insert(payload).select("*").single();
    if (error) throw error;
    return NextResponse.json({ addon: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create reservation extra." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as ReservationAddonInput;
    if (!body.id) return NextResponse.json({ error: "Add-on id is required." }, { status: 400 });
    const payload = cleanAddonInput(body);
    const { data, error } = await getSupabaseAdmin().from("reservation_addons").update(payload).eq("id", body.id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ addon: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update reservation extra." }, { status: 400 });
  }
}
