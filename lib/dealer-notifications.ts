import "server-only";

import { getDealerSettings } from "@/lib/dealer-settings";
import { recordDealerPortalAuditEventBestEffort } from "@/lib/dealer-portal-audit";
import {
  activeDealerUserEmailRecipients,
  buildClaimEventPayload,
  buildCommercialFeeMessage,
  buildLeadOpportunityMessage,
  commercialEmailRecipient,
  leadOpportunityEventType,
  normaliseWhatsAppDestination,
  notificationDedupeKey,
} from "@/lib/dealer-notification-content";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { DealerLeadAllocation, DealerPortalAccount, DealerPortalUserSummary } from "@/types/dealer-portal";
import type { DealerNotificationEventType, DealerNotificationInsert } from "@/types/dealer-notifications";

type LeadNotificationLead = Parameters<typeof buildLeadOpportunityMessage>[0];

type NotifyAllocationInput = {
  lead: LeadNotificationLead;
  dealer: DealerPortalAccount;
  allocation: DealerLeadAllocation;
  createdBy?: string | null;
};

type RecordEventInput = {
  eventType: DealerNotificationEventType;
  dealerAccountId: string;
  dealerUserId?: string | null;
  websiteLeadId?: number | null;
  allocationId?: string | null;
  claimId?: string | null;
  purchaseId?: string | null;
  feeId?: string | null;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
};

type NotifyFeeInput = {
  dealer: DealerPortalAccount;
  lead?: LeadNotificationLead | null;
  purchaseId: string;
  feeId: string;
  websiteLeadId: number;
  claimId: string;
  feeAmount: number;
  createdBy?: string | null;
};

export async function notifyDealerLeadAllocation(input: NotifyAllocationInput) {
  return bestEffort("dealer lead allocation notification", async () => {
    if (input.allocation.allocation_status !== "available") return [];
    const distance = distanceFromAllocation(input.allocation);
    const eventType = leadOpportunityEventType(input.allocation.allocation_method);
    const message = buildLeadOpportunityMessage(input.lead, distance);
    const users = await activeUsersForDealer(input.dealer.id);
    const emailRecipients = activeDealerUserEmailRecipients(users);
    const rows = [];
    for (const recipient of emailRecipients) {
      rows.push(await createAndMaybeSendEmail({
        dedupe_key: notificationDedupeKey([eventType, "email", input.allocation.id, recipient.destination]),
        website_lead_id: Number(input.lead.id),
        dealer_account_id: input.dealer.id,
        dealer_user_id: recipient.dealerUserId,
        allocation_id: input.allocation.id,
        event_type: eventType,
        channel: "email",
        destination: recipient.destination,
        subject: message.subject,
        message_body: message.body,
        payload: message.payload,
        status: process.env.RESEND_API_KEY ? "queued" : "not_configured",
        provider: process.env.RESEND_API_KEY ? "resend" : null,
        queued_at: process.env.RESEND_API_KEY ? new Date().toISOString() : null,
        created_by: input.createdBy ?? null,
      }));
    }

    const whatsapp = normaliseWhatsAppDestination(input.dealer.mobile_whatsapp);
    rows.push(await insertNotification({
      dedupe_key: notificationDedupeKey([eventType, "whatsapp", input.allocation.id, whatsapp]),
      website_lead_id: Number(input.lead.id),
      dealer_account_id: input.dealer.id,
      allocation_id: input.allocation.id,
      event_type: eventType,
      channel: "whatsapp",
      destination: whatsapp,
      subject: message.subject,
      message_body: message.body,
      payload: message.payload,
      status: whatsapp ? "not_configured" : "skipped",
      provider: null,
      safe_error: whatsapp ? "No automated WhatsApp provider is configured." : "Dealer has no WhatsApp/mobile destination.",
      created_by: input.createdBy ?? null,
    }));
    await markAllocationNotified(input.allocation.id, rows.some(row => row.status === "sent" || row.status === "not_configured" || row.status === "skipped"));
    return rows;
  });
}

export async function recordClaimNotificationEvent(input: {
  dealerAccountId: string;
  dealerUserId: string | null;
  websiteLeadId: number;
  claimId?: string | null;
  result: "claimed" | "already_claimed";
}) {
  return bestEffort("dealer claim notification event", async () => insertNotification({
    dedupe_key: notificationDedupeKey(["claim_result", input.result, input.websiteLeadId, input.dealerAccountId, input.dealerUserId]),
    website_lead_id: input.websiteLeadId,
    dealer_account_id: input.dealerAccountId,
    dealer_user_id: input.dealerUserId,
    claim_id: input.claimId ?? null,
    event_type: input.result === "claimed" ? "lead_claimed" : "claim_already_claimed",
    channel: "event",
    destination: null,
    payload: buildClaimEventPayload(input.websiteLeadId, input.claimId ?? null, input.result),
    status: "sent",
    sent_at: new Date().toISOString(),
    created_by: input.dealerUserId,
  }));
}

export async function recordDealerNotificationEvent(input: RecordEventInput) {
  return bestEffort("dealer notification event", async () => insertNotification({
    dedupe_key: notificationDedupeKey([input.eventType, "event", input.dealerAccountId, input.websiteLeadId, input.allocationId, input.claimId, input.purchaseId, input.feeId]),
    website_lead_id: input.websiteLeadId ?? null,
    dealer_account_id: input.dealerAccountId,
    dealer_user_id: input.dealerUserId ?? null,
    allocation_id: input.allocationId ?? null,
    claim_id: input.claimId ?? null,
    purchase_id: input.purchaseId ?? null,
    fee_id: input.feeId ?? null,
    event_type: input.eventType,
    channel: "event",
    destination: null,
    payload: input.payload ?? {},
    status: "sent",
    sent_at: new Date().toISOString(),
    created_by: input.createdBy ?? null,
  }));
}

export async function notifySuccessfulPurchaseFeeCreated(input: NotifyFeeInput) {
  return bestEffort("dealer successful purchase fee notification", async () => {
    const destination = commercialEmailRecipient(input.dealer);
    const message = buildCommercialFeeMessage({
      dealer: input.dealer,
      lead: input.lead,
      feeAmount: input.feeAmount,
      purchaseId: input.purchaseId,
      feeId: input.feeId,
    });
    const row = await createAndMaybeSendEmail({
      dedupe_key: notificationDedupeKey(["successful_purchase_fee_created", "email", input.feeId, destination]),
      website_lead_id: input.websiteLeadId,
      dealer_account_id: input.dealer.id,
      claim_id: input.claimId,
      purchase_id: input.purchaseId,
      fee_id: input.feeId,
      event_type: "successful_purchase_fee_created",
      channel: "email",
      destination,
      subject: message.subject,
      message_body: message.body,
      payload: message.payload,
      status: destination ? process.env.RESEND_API_KEY ? "queued" : "not_configured" : "skipped",
      provider: destination && process.env.RESEND_API_KEY ? "resend" : null,
      safe_error: destination ? process.env.RESEND_API_KEY ? null : "Email provider is not configured." : "Dealer account has no accounts_email or main_email.",
      queued_at: destination && process.env.RESEND_API_KEY ? new Date().toISOString() : null,
      created_by: input.createdBy ?? null,
    });
    return row;
  });
}

async function createAndMaybeSendEmail(row: DealerNotificationInsert) {
  const inserted = await insertNotification(row);
  if (inserted.duplicate || inserted.status !== "queued" || !inserted.destination || !inserted.subject || !inserted.message_body) return inserted;
  const result = await sendResendEmail(inserted.destination, inserted.subject, inserted.message_body);
  const now = new Date().toISOString();
  if (result.ok) {
    await updateNotification(inserted.id, {
      status: "sent",
      sent_at: now,
      provider_message_id: result.providerMessageId,
      provider_response: result.providerResponse,
    });
    await recordNotificationAudit(inserted, "dealer_notification_sent", "sent");
    return { ...inserted, status: "sent", sent_at: now, provider_message_id: result.providerMessageId };
  }
  await updateNotification(inserted.id, {
    status: "failed",
    failed_at: now,
    safe_error: result.safeError,
    provider_response: result.providerResponse,
  });
  await recordNotificationAudit(inserted, "dealer_notification_failed", "failed");
  return { ...inserted, status: "failed", failed_at: now, safe_error: result.safeError };
}

async function insertNotification(row: DealerNotificationInsert) {
  const db = getSupabaseAdminClient();
  const { data, error } = await db.from("dealer_portal_notifications").insert(row).select("*").single();
  if (!error) {
    const inserted = { ...data, duplicate: false } as Record<string, unknown> & { id: string; status: string; destination?: string; subject?: string; message_body?: string; duplicate: boolean };
    await recordNotificationAudit(inserted, "dealer_notification_recorded", String(data.status ?? row.status));
    if (row.status !== "queued") await recordNotificationAudit(inserted, "dealer_notification_terminal_status", row.status);
    return inserted;
  }
  if (error.code === "23505") {
    const existing = await db.from("dealer_portal_notifications").select("*").eq("dedupe_key", row.dedupe_key).maybeSingle();
    if (!existing.error && existing.data) return { ...existing.data, duplicate: true } as Record<string, unknown> & { id: string; status: string; destination?: string; subject?: string; message_body?: string; duplicate: boolean };
  }
  throw new Error(error.message);
}

async function recordNotificationAudit(notification: Record<string, unknown>, auditEventType: string, status: string) {
  await recordDealerPortalAuditEventBestEffort({
    eventType: auditEventType,
    websiteLeadId: notification.website_lead_id as string | number | null,
    dealerAccountId: notification.dealer_account_id as string | null,
    dealerUserId: notification.created_by as string | null,
    eventData: {
      notification_id: notification.id,
      notification_event_type: notification.event_type,
      channel: notification.channel,
      status,
      allocation_id: notification.allocation_id ?? null,
      claim_id: notification.claim_id ?? null,
      purchase_id: notification.purchase_id ?? null,
      fee_id: notification.fee_id ?? null,
      recipient_user_id: notification.dealer_user_id ?? null,
    },
  });
}

async function updateNotification(id: string, updates: Record<string, unknown>) {
  const { error } = await getSupabaseAdminClient().from("dealer_portal_notifications").update(updates).eq("id", id);
  if (error) console.warn("Unable to update dealer notification", error.message);
}

async function activeUsersForDealer(dealerAccountId: string): Promise<DealerPortalUserSummary[]> {
  const db = getSupabaseAdminClient();
  const { data, error } = await db.from("dealer_portal_users").select("*").eq("dealer_account_id", dealerAccountId).eq("active", true);
  if (error) throw new Error(`Unable to load dealer notification recipients: ${error.message}`);
  const users = (data ?? []) as Array<{ id: string; dealer_account_id: string; user_id: string; role: "dealer_admin" | "dealer_user"; active: boolean; invited_at: string | null; last_seen_at: string | null; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null }>;
  const emails = await authEmailMap(users.map(user => user.user_id));
  return users.map(user => ({ ...user, email: emails.get(user.user_id) ?? null }));
}

async function authEmailMap(userIds: string[]) {
  const wanted = new Set(userIds);
  const emails = new Map<string, string>();
  if (!wanted.size) return emails;
  let page = 1;
  while (page <= 10 && emails.size < wanted.size) {
    const { data, error } = await getSupabaseAdminClient().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Unable to load auth users: ${error.message}`);
    for (const user of data.users) {
      if (wanted.has(user.id) && user.email) emails.set(user.id, user.email);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return emails;
}

async function sendResendEmail(to: string, subject: string, message: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, safeError: "Email provider is not configured.", providerResponse: { code: "not_configured" } };
  const settings = await getDealerSettings();
  const fromAddress = process.env.RESEND_FROM_EMAIL || settings.email_from_address || settings.email;
  const from = fromAddress.includes("<") ? fromAddress : `${settings.email_from_name || settings.business_name || "YesMoto"} <${fromAddress}>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: settings.email_reply_to || settings.email || undefined,
      subject,
      html: `<div style="font-family:Arial,sans-serif;color:#18211d;white-space:pre-line">${escapeHtml(message)}</div>`,
    }),
  });
  const provider = await response.json().catch(() => ({ message: "Invalid provider response" }));
  if (!response.ok) {
    return {
      ok: false,
      safeError: `Resend failed: ${String((provider as { message?: string }).message ?? response.statusText)}`,
      providerResponse: safeProviderResponse(provider),
    };
  }
  return {
    ok: true,
    providerMessageId: String((provider as { id?: string }).id ?? ""),
    providerResponse: safeProviderResponse(provider),
  };
}

async function markAllocationNotified(allocationId: string, shouldMark: boolean) {
  if (!shouldMark) return;
  const { error } = await getSupabaseAdminClient()
    .from("dealer_lead_allocations")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", allocationId)
    .is("notified_at", null);
  if (error) console.warn("Unable to mark dealer allocation notified", error.message);
}

function distanceFromAllocation(allocation: DealerLeadAllocation) {
  const radius = allocation.match_reasons?.passed;
  if (!Array.isArray(radius)) return null;
  const match = radius.find(item => item && typeof item === "object" && "code" in item && item.code === "maximum_radius");
  if (!match || typeof match !== "object" || !("detail" in match) || typeof match.detail !== "string") return null;
  const number = match.detail.match(/([\d.]+)\s*miles/i)?.[1];
  return number ? Number(number) : null;
}

function safeProviderResponse(provider: unknown) {
  if (!provider || typeof provider !== "object") return {};
  const record = provider as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const key of ["id", "message", "name", "statusCode"]) {
    if (record[key] != null) safe[key] = record[key];
  }
  return safe;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

async function bestEffort<T>(label: string, work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    console.warn(`Unable to complete ${label}`, error instanceof Error ? error.message : error);
    return null;
  }
}
