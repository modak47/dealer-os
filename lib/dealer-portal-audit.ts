import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type DealerPortalAuditEventInput = {
  eventType: string;
  websiteLeadId?: number | string | null;
  dealerAccountId?: string | null;
  dealerUserId?: string | null;
  eventData?: Record<string, unknown>;
};

export async function recordDealerPortalAuditEvent(input: DealerPortalAuditEventInput) {
  const { error } = await getSupabaseAdminClient().from("dealer_portal_audit_events").insert({
    website_lead_id: input.websiteLeadId ?? null,
    dealer_account_id: input.dealerAccountId ?? null,
    dealer_user_id: input.dealerUserId ?? null,
    event_type: input.eventType,
    event_data: input.eventData ?? {},
  });
  if (error) throw new Error(`Unable to record dealer portal audit event: ${error.message}`);
}

export async function recordDealerPortalAuditEventBestEffort(input: DealerPortalAuditEventInput) {
  try {
    await recordDealerPortalAuditEvent(input);
  } catch (error) {
    console.warn("Unable to record dealer portal audit event", error instanceof Error ? error.message : error);
  }
}

export function changedFieldSummary(previous: Record<string, unknown> | null | undefined, next: Record<string, unknown>, fields: string[]) {
  const changes: Record<string, { previous: unknown; next: unknown }> = {};
  for (const field of fields) {
    const previousValue = normaliseComparable(previous?.[field]);
    const nextValue = normaliseComparable(next[field]);
    if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) changes[field] = { previous: previousValue, next: nextValue };
  }
  return changes;
}

function normaliseComparable(value: unknown) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(item => typeof item === "string" ? item.trim() : item).filter(item => item !== "");
  if (typeof value === "string") return value.trim();
  return value;
}
