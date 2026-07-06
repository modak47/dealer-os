import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe is not configured.");
  if (!client) client = new Stripe(key);
  return client;
}

export const reservationAmountPence = () => {
  const amount = Number(process.env.STRIPE_RESERVATION_AMOUNT || "9900");
  return Number.isInteger(amount) && amount > 0 ? amount : 9900;
};
