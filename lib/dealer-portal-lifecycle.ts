import type { DealerLeadClaim, DealerLeadClaimStatus } from "@/types/dealer-portal";

export const dealerLostReasons = [
  "Couldn't agree price",
  "Customer stopped responding",
  "Customer sold elsewhere",
  "Condition not as described",
  "Mileage",
  "Vehicle history",
  "Outstanding finance",
  "Too far away",
  "Specification unsuitable",
  "Customer decided not to sell",
  "Other",
] as const;

export type DealerLostReason = typeof dealerLostReasons[number];

export const activeDealerClaimStatuses: DealerLeadClaimStatus[] = [
  "claimed",
  "attempting_contact",
  "contacted",
  "offer_made",
  "negotiating",
  "agreed_to_purchase",
  "collection_booked",
  "purchased",
  "purchased_later",
];

const lostReasonLookup = new Map(dealerLostReasons.map(reason => [normaliseReason(reason), reason]));

export function normaliseReason(value: string) {
  return value.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
}

export function cleanDealerLostReason(value: string | null | undefined): DealerLostReason | null {
  const normalised = normaliseReason(String(value ?? ""));
  return lostReasonLookup.get(normalised) ?? null;
}

export function dealerPreviouslyHandledClaim(claim: Pick<DealerLeadClaim, "status">) {
  return claim.status === "lost" || claim.status === "returned_to_pool";
}

export function isInsideAttributionPeriod(claim: Pick<DealerLeadClaim, "attribution_expires_at">, now = new Date()) {
  if (!claim.attribution_expires_at) return false;
  const expiry = new Date(claim.attribution_expires_at);
  return !Number.isNaN(expiry.getTime()) && now.getTime() <= expiry.getTime();
}

export function requiresPurchasedLaterDecision(claim: Pick<DealerLeadClaim, "status" | "attribution_expires_at">, now = new Date()) {
  return claim.status === "lost" && !isInsideAttributionPeriod(claim, now);
}
