import { NextResponse } from "next/server";
import { cleanEmail, cleanPhone, cleanText, stockId } from "@/lib/crm-validation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, reservationAmountPence } from "@/lib/stripe";

export async function POST(request: Request) {
  let checkoutId: string | null = null; let bikeId: number | null = null; let stripeSessionId: string | null = null;
  try {
    const body = await request.json() as Record<string, unknown>;
    bikeId = stockId(body.stock_bike_id); const firstName = cleanText(body.first_name ?? body.firstName, 100), lastName = cleanText(body.last_name ?? body.lastName, 100), email = cleanEmail(body.email), phone = cleanPhone(body.phone), acceptedTerms = body.consent === true || body.acceptedTerms === true;
    const validation={bikeIdValid:Boolean(bikeId),firstNameValid:Boolean(firstName),lastNameValid:Boolean(lastName),emailValid:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),phoneValid:/^\+?[0-9 ()-]{7,20}$/.test(phone),acceptedTerms};
    console.info("[Stripe checkout] validation",validation);
    if(!validation.bikeIdValid)throw new Error("This motorcycle could not be identified. Please refresh the page.");
    if(!validation.firstNameValid)throw new Error("Enter your first name.");
    if(!validation.lastNameValid)throw new Error("Enter your last name.");
    if(!validation.emailValid)throw new Error("Enter a valid email address.");
    if(!validation.phoneValid)throw new Error("Enter a valid phone number, for example +447904443965.");
    if(!validation.acceptedTerms)throw new Error("Please accept the reservation terms.");
    const db = getSupabaseAdmin();
    const { data: bike, error: bikeError } = await db.from("stock_bikes").select("id,make,model,variant,year,registration,status,price,reserve_enabled,show_on_website").eq("id", bikeId).maybeSingle();
    if (bikeError) throw bikeError; if (!bike) throw new Error("Motorcycle not found.");
    if (!["in stock", "on forecourt", "available"].includes(String(bike.status).toLowerCase()) || bike.reserve_enabled === false) throw new Error("This motorcycle is no longer available to reserve.");
    const amount = reservationAmountPence(); const expiresAt = new Date(Date.now() + 31 * 60 * 1000);
    const pending = await db.from("stripe_reservation_checkouts").insert({ stock_bike_id: bike.id, amount_pence: amount, status: "Pending", customer_first_name: firstName, customer_last_name: lastName, customer_email: email, customer_phone: phone, expires_at: expiresAt.toISOString() }).select("id").single();
    if (pending.error) { if (pending.error.code === "23505") throw new Error("Another customer is currently reserving this motorcycle. Please contact us if you need help."); throw pending.error; }
    const createdCheckoutId = String(pending.data.id); checkoutId = createdCheckoutId;
    const stripe = getStripe(); const origin = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
    const title = [bike.year, bike.make, bike.model, bike.variant].filter(Boolean).join(" ");
    const session = await stripe.checkout.sessions.create({ mode: "payment", customer_email: email, phone_number_collection: { enabled: true }, client_reference_id: createdCheckoutId,
      line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: amount, product_data: { name: `Reserve ${title}`, description: `Reservation fee deducted from the final purchase price for ${bike.registration || title}` } } }],
      metadata: { checkout_id: createdCheckoutId, bike_id: String(bike.id), registration: String(bike.registration || "") }, payment_intent_data: { metadata: { checkout_id: createdCheckoutId, bike_id: String(bike.id) } },
      success_url: `${origin}/reservation/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/used-bikes/${cleanText(body.slug, 180)}?reservation=cancelled`, expires_at: Math.floor(expiresAt.getTime() / 1000),
    });
    stripeSessionId = session.id; if (!session.url) throw new Error("Stripe did not return a checkout address.");
    const saved = await db.from("stripe_reservation_checkouts").update({ stripe_session_id: session.id }).eq("id", checkoutId); if (saved.error) throw saved.error;
    const reserved = await db.from("stock_bikes").update({ status: "Reserved" }).eq("id", bike.id).in("status", ["In Stock", "ON FORECOURT", "Available"]).select("id").maybeSingle();
    if (reserved.error || !reserved.data) { await stripe.checkout.sessions.expire(session.id); throw new Error("This motorcycle has just become unavailable."); }
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (stripeSessionId) { try { await getStripe().checkout.sessions.expire(stripeSessionId); } catch {} }
    if (checkoutId) await getSupabaseAdmin().from("stripe_reservation_checkouts").delete().eq("id", checkoutId).eq("status", "Pending");
    if (checkoutId && bikeId) await getSupabaseAdmin().from("stock_bikes").update({ status: "In Stock" }).eq("id", bikeId).eq("status", "Reserved");
    console.error("Unable to create Stripe reservation checkout", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start secure checkout." }, { status: 400 });
  }
}
