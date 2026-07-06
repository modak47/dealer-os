import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { expireReservationCheckout, fulfilReservationCheckout } from "@/lib/stripe-reservations";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  try {
    const signature = request.headers.get("stripe-signature"); if (!signature) throw new Error("Missing Stripe signature.");
    const event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") await fulfilReservationCheckout(event.data.object);
    if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") await expireReservationCheckout(event.data.object);
    return NextResponse.json({ received: true });
  } catch (error) { console.error("Stripe webhook failed", error instanceof Error ? error.message : error); return NextResponse.json({ error: "Invalid Stripe webhook." }, { status: 400 }); }
}
