import { absoluteUrl } from "@/lib/site-url";
import type { DealerLeadAllocation, DealerPortalAccount, DealerPortalUserSummary } from "@/types/dealer-portal";
import type { DealerNotificationEventType } from "@/types/dealer-notifications";

type LeadNotificationLead = {
  id?: number | null;
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
  mileage?: string | number | null;
  location_town?: string | null;
};

export type DealerNotificationRecipient = {
  dealerUserId: string | null;
  destination: string;
};

export function leadOpportunityEventType(allocationMethod: DealerLeadAllocation["allocation_method"]): DealerNotificationEventType {
  if (allocationMethod === "direct") return "direct_allocation";
  if (allocationMethod === "dealer_group") return "dealer_group_allocation";
  return "new_suitable_lead";
}

export function dealerPortalLink() {
  return absoluteUrl("/dealer-portal");
}

export function buildDealerSafeLeadNotificationPayload(lead: LeadNotificationLead, distanceMiles?: number | null) {
  return {
    lead_id: lead.id ?? null,
    year: lead.year == null || String(lead.year).trim() === "" ? null : String(lead.year),
    make: lead.make ?? null,
    model: lead.model ?? null,
    mileage: formatMileage(lead.mileage),
    approximate_location: lead.location_town ?? null,
    approximate_distance_miles: typeof distanceMiles === "number" && Number.isFinite(distanceMiles) ? Math.round(distanceMiles * 10) / 10 : null,
    dealer_portal_url: dealerPortalLink(),
  };
}

export function buildLeadOpportunityMessage(lead: LeadNotificationLead, distanceMiles?: number | null) {
  const payload = buildDealerSafeLeadNotificationPayload(lead, distanceMiles);
  const vehicle = [payload.year, payload.make, payload.model].filter(Boolean).join(" ") || "Motorcycle opportunity";
  const details = [
    payload.mileage ? `Mileage: ${payload.mileage}` : null,
    payload.approximate_location ? `Location: ${payload.approximate_location}` : null,
    payload.approximate_distance_miles != null ? `Approx distance: ${payload.approximate_distance_miles} miles` : null,
  ].filter(Boolean);
  return {
    subject: `New YesMoto dealer opportunity: ${vehicle}`,
    body: [
      `A motorcycle opportunity is available in the Dealer Portal.`,
      "",
      vehicle,
      ...details,
      "",
      `Open Dealer Portal: ${payload.dealer_portal_url}`,
    ].join("\n"),
    payload,
  };
}

export function buildClaimEventPayload(leadId: number, claimId: string | null, status: "claimed" | "already_claimed") {
  return {
    lead_id: leadId,
    claim_id: claimId,
    result: status,
    dealer_portal_url: dealerPortalLink(),
  };
}

export function buildCommercialFeeMessage(input: {
  dealer: Pick<DealerPortalAccount, "trading_name">;
  lead?: LeadNotificationLead | null;
  feeAmount: number;
  purchaseId: string;
  feeId: string;
}) {
  const vehicle = input.lead ? [input.lead.year, input.lead.make, input.lead.model].filter(Boolean).join(" ") : "";
  const amount = input.feeAmount.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
  return {
    subject: `Successful Purchase Fee created${vehicle ? `: ${vehicle}` : ""}`,
    body: [
      `A Successful Purchase Fee has been created for ${input.dealer.trading_name}.`,
      "",
      vehicle ? `Vehicle: ${vehicle}` : null,
      `Fee amount: ${amount}`,
      "",
      `Open Dealer Portal: ${dealerPortalLink()}`,
    ].filter(Boolean).join("\n"),
    payload: {
      purchase_id: input.purchaseId,
      fee_id: input.feeId,
      fee_amount: input.feeAmount,
      vehicle: vehicle || null,
      dealer_portal_url: dealerPortalLink(),
    },
  };
}

export function activeDealerUserEmailRecipients(users: DealerPortalUserSummary[]) {
  const seen = new Set<string>();
  const recipients: DealerNotificationRecipient[] = [];
  for (const user of users) {
    const email = normaliseEmail(user.email);
    if (!user.active || !email || seen.has(email)) continue;
    seen.add(email);
    recipients.push({ dealerUserId: user.user_id, destination: email });
  }
  return recipients;
}

export function commercialEmailRecipient(dealer: Pick<DealerPortalAccount, "accounts_email" | "main_email">) {
  return normaliseEmail(dealer.accounts_email) || normaliseEmail(dealer.main_email);
}

export function normaliseWhatsAppDestination(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.startsWith("0")) return `+44${digits.slice(1)}`;
  return `+${digits}`;
}

export function notificationDedupeKey(parts: Array<string | number | null | undefined>) {
  return parts.map(part => String(part ?? "none").trim().toLowerCase()).join(":");
}

function normaliseEmail(value: string | null | undefined) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function formatMileage(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return `${Math.round(value).toLocaleString("en-GB")} miles`;
  const text = String(value ?? "").trim();
  return text || null;
}
