import { NextResponse } from "next/server";
import { authenticatePortalCustomer } from "@/lib/customer-portal";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; code?: string; delivery_id?: string; name?: string; signature?: string };
    const auth = await authenticatePortalCustomer({ email: body.email ?? "", code: body.code ?? "" });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
    const deliveryId = String(body.delivery_id || "");
    const signature = String(body.signature || "");
    const name = String(body.name || "").trim();
    if (!deliveryId || !name || !signature.startsWith("data:image/png;base64,")) {
      return NextResponse.json({ error: "Name and signature are required." }, { status: 400 });
    }

    const { data, error } = await auth.db
      .from("crm_deliveries")
      .update({ customer_confirmed_at: new Date().toISOString(), customer_signature_name: name, customer_signature_data_url: signature })
      .eq("id", deliveryId)
      .eq("customer_id", auth.customer.id)
      .select("id,customer_confirmed_at,customer_signature_name")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Delivery record not found." }, { status: 404 });
    return NextResponse.json({ delivery: data });
  } catch (error) {
    console.error("Portal delivery confirmation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to confirm delivery." }, { status: 500 });
  }
}
