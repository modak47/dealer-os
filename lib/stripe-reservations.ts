import "server-only";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function fulfilReservationCheckout(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;
  const checkoutId = session.metadata?.checkout_id;
  if (!checkoutId) throw new Error("Stripe reservation metadata is missing.");
  const db = getSupabaseAdmin();
  const { error: updateError } = await db.from("stripe_reservation_checkouts").update({
    status: "Paid", stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    customer_email: session.customer_details?.email ?? session.customer_email ?? null,
    customer_phone: session.customer_details?.phone ?? null, paid_at: new Date().toISOString(),
  }).eq("id", checkoutId);
  if (updateError) throw updateError;
  const { error } = await db.rpc("crm_complete_stripe_reservation", { p_checkout_id: checkoutId });
  if (error) throw error;
}

export async function expireReservationCheckout(session: Stripe.Checkout.Session) {
  const checkoutId = session.metadata?.checkout_id;
  if (!checkoutId) return;
  const db = getSupabaseAdmin();
  const { data } = await db.from("stripe_reservation_checkouts").update({ status: "Expired" }).eq("id", checkoutId).eq("status", "Pending").select("stock_bike_id").maybeSingle();
  if (!data) return;
  const active = await db.from("crm_reservations").select("id", { count: "exact", head: true }).eq("stock_bike_id", data.stock_bike_id).in("status", ["Active", "Deposit Taken"]);
  if (!active.count) await db.from("stock_bikes").update({ status: "In Stock" }).eq("id", data.stock_bike_id).eq("status", "Reserved");
}
