import "server-only";

import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, safeNumber } from "@/lib/website-leads";
import type { DealerPortalAccount } from "@/types/dealer-portal";

export async function getCurrentDealerPortalAccount() {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { data, error } = await getSupabaseAdminClient()
    .from("dealer_portal_users")
    .select("role,dealer:dealer_portal_accounts(*)")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  const relatedDealer = Array.isArray(data?.dealer) ? data.dealer[0] : data?.dealer;
  if (error || !relatedDealer) return null;
  const dealer = relatedDealer as unknown as DealerPortalAccount;
  if (dealer.account_status !== "active") return null;
  return { userId, role: String(data?.role ?? "dealer_user"), dealer };
}

export function cleanDealerAccountPayload(body: Record<string, unknown>, userId: string | null, creating: boolean) {
  const payload: Record<string, unknown> = {
    trading_name: cleanText(body.trading_name, 180),
    limited_company_name: cleanText(body.limited_company_name, 180),
    company_registration_number: cleanText(body.company_registration_number, 60),
    vat_number: cleanText(body.vat_number, 60),
    registered_address: cleanText(body.registered_address, 600),
    trading_address: cleanText(body.trading_address, 600),
    main_contact: cleanText(body.main_contact, 160),
    telephone: cleanText(body.telephone, 80),
    mobile_whatsapp: cleanText(body.mobile_whatsapp, 80),
    main_email: cleanText(body.main_email, 180),
    accounts_email: cleanText(body.accounts_email, 180),
    website: cleanText(body.website, 240),
    postcode: cleanText(body.postcode, 30),
    autotrader_dealer_ref: cleanText(body.autotrader_dealer_ref, 120),
    account_status: cleanText(body.account_status, 20) || "pending",
    successful_purchase_fee: safeNumber(body.successful_purchase_fee) ?? 50,
    attribution_period_days: Math.max(0, Math.round(safeNumber(body.attribution_period_days) ?? 60)),
    claim_expiry_hours: safeNumber(body.claim_expiry_hours),
    update_deadline_hours: safeNumber(body.update_deadline_hours),
    internal_notes: cleanText(body.internal_notes, 4000),
    updated_by: userId,
  };
  if (!payload.trading_name) throw new Error("Trading name is required.");
  if (!["pending", "active", "suspended", "closed"].includes(String(payload.account_status))) throw new Error("Account status is invalid.");
  if (creating) payload.created_by = userId;
  return payload;
}

export function redactLeadForDealer<T extends Record<string, unknown>>(lead: T, unlocked: boolean): T {
  if (unlocked) return lead;
  return {
    ...lead,
    fname: null,
    lname: null,
    email: null,
    phone: null,
    postcode: lead.location_town ? null : lead.postcode,
    normalised_postcode: null,
    location_display_name: null,
    internal_notes: null,
    valuation_notes: null,
    similar_bikes: null,
    auto_trader_search: null,
    estimated_margin: null,
  };
}
