export type ReleaseState = { status?: string | null; opportunity_mode?: string | null; marketplace_status?: string | null; portal_ready_at?: string | null; archived_at?: string | null; marketplace_accepted_offer_id?: string | null };
export function releaseBlockReason(lead: ReleaseState) {
  if (lead.archived_at) return "Lead is archived.";
  if (!lead.portal_ready_at) return "Staff must mark this lead Ready for Dealer Portal before release.";
  if (!["direct_claim", "marketplace_offer"].includes(lead.opportunity_mode ?? "")) return "Unknown opportunity mode.";
  if (["purchased", "internal_buying", "purchase_agreed", "dealer_claimed", "dealer_purchased", "closed", "declined", "accepted", "dealer_pool_available", "dealer_allocated"].includes(lead.status ?? "")) return "Lead is active, already released or terminal.";
  if (lead.marketplace_accepted_offer_id) return "A marketplace offer has already been accepted.";
  if (lead.opportunity_mode === "marketplace_offer" && !["submitted", "under_review"].includes(lead.marketplace_status ?? "")) return "Marketplace lead must be submitted or under review before release.";
  return null;
}
