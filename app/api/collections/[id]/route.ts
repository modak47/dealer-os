import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { confirmationLinks, updateCollection } from "@/lib/collections";

export const dynamic = "force-dynamic";

const selectCollection = "*,stock:stock_bikes(id,stock_number,registration,make,model,variant,year,status,website_lead_id,customer_name,customer_phone,customer_email,customer_address,customer_postcode,collection_address,collection_postcode,collection_latitude,collection_longitude,collection_location_display_name,distance_from_yesmoto_miles,estimated_drive_minutes,collection_notes,purchase_price,deposit_paid,balance_outstanding,expected_arrival_date,mileage),assigned_user:dealer_users!stock_collections_assigned_user_id_fkey(id,full_name,role,phone)";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const { id } = await params;
    const { data, error } = await getSupabaseAdmin().from("stock_collections").select(selectCollection).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Collection not found." }, { status: 404 });
    const { data: events } = await getSupabaseAdmin().from("stock_collection_events").select("*").eq("collection_id", id).order("created_at", { ascending: false });
    return NextResponse.json({ collection: data, events: events ?? [], links: confirmationLinks(data as never) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load collection." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateCollection(id, body, await getCurrentUserId()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update collection." }, { status: 400 });
  }
}
