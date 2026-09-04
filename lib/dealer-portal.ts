import "server-only";

import { getCurrentUserId } from "@/lib/current-user";
import { changedFieldSummary, recordDealerPortalAuditEvent } from "@/lib/dealer-portal-audit";
export { dealerClaimedCustomerLeadFields, dealerLeadSelectClause, dealerLeadSourceFields, dealerSafeLeadFields, redactLeadForDealer, yesMotoInternalLeadFields } from "@/lib/dealer-portal-redaction";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, safeNumber } from "@/lib/website-leads";
import type { DealerBuyingPreferences, DealerGeographyPreferences, DealerLeadClaim, DealerPortalAccount, DealerPortalAccountWithPreferences, DealerPortalUserRole } from "@/types/dealer-portal";

const preferenceArrayLimit = 30;
const dealerSelfAccountAuditFields = ["trading_address", "main_contact", "telephone", "mobile_whatsapp", "main_email", "accounts_email", "website", "postcode"];
const dealerStaffAccountAuditFields = ["trading_name", "limited_company_name", "company_registration_number", "vat_number", "registered_address", "trading_address", "main_contact", "telephone", "mobile_whatsapp", "main_email", "accounts_email", "website", "postcode", "account_status", "successful_purchase_fee", "attribution_period_days", "claim_expiry_hours", "update_deadline_hours"];
const dealerBuyingPreferenceAuditFields = ["motorcycle_types", "makes_wanted", "makes_excluded", "models_wanted", "minimum_year", "maximum_age_years", "minimum_value", "maximum_value", "maximum_mileage", "minimum_engine_cc", "maximum_engine_cc", "accepts_non_running", "accepts_insurance_category", "accepts_outstanding_finance", "accepts_imported", "accepts_modified"];
const dealerGeographyPreferenceAuditFields = ["england", "wales", "scotland", "northern_ireland", "republic_of_ireland", "maximum_radius_miles"];

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
  return { userId, role: normaliseDealerRole(data?.role), dealer: await withDealerPreferences(dealer) };
}

export type DealerPortalSession = NonNullable<Awaited<ReturnType<typeof getCurrentDealerPortalAccount>>>;

export function normaliseDealerRole(value: unknown): DealerPortalUserRole {
  return value === "dealer_admin" ? "dealer_admin" : "dealer_user";
}

export function isDealerPortalAdmin(session: DealerPortalSession | null): session is DealerPortalSession {
  return session?.role === "dealer_admin";
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

export function defaultBuyingPreferences(dealerAccountId: string): DealerBuyingPreferences {
  return {
    dealer_account_id: dealerAccountId,
    motorcycle_types: [],
    makes_wanted: [],
    makes_excluded: [],
    models_wanted: [],
    minimum_year: null,
    maximum_age_years: null,
    minimum_value: null,
    maximum_value: null,
    maximum_mileage: null,
    minimum_engine_cc: null,
    maximum_engine_cc: null,
    accepts_non_running: false,
    accepts_insurance_category: false,
    accepts_outstanding_finance: false,
    accepts_imported: false,
    accepts_modified: false,
  };
}

export function defaultGeographyPreferences(dealerAccountId: string): DealerGeographyPreferences {
  return {
    dealer_account_id: dealerAccountId,
    england: true,
    wales: true,
    scotland: false,
    northern_ireland: false,
    republic_of_ireland: false,
    maximum_radius_miles: null,
  };
}

function cleanPreferenceArray(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(new Set(raw.map(item => cleanText(item, 80)).filter((item): item is string => Boolean(item)))).slice(0, preferenceArrayLimit);
}

function cleanPositiveNumber(value: unknown) {
  const number = safeNumber(value);
  return number == null ? null : Math.max(0, Math.round(number));
}

function cleanBoolean(value: unknown) {
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

export function cleanDealerBuyingPreferencesPayload(body: Record<string, unknown>, dealerAccountId: string) {
  return {
    dealer_account_id: dealerAccountId,
    motorcycle_types: cleanPreferenceArray(body.motorcycle_types),
    makes_wanted: cleanPreferenceArray(body.makes_wanted),
    makes_excluded: cleanPreferenceArray(body.makes_excluded),
    models_wanted: cleanPreferenceArray(body.models_wanted),
    minimum_year: cleanPositiveNumber(body.minimum_year),
    maximum_age_years: cleanPositiveNumber(body.maximum_age_years),
    minimum_value: cleanPositiveNumber(body.minimum_value),
    maximum_value: cleanPositiveNumber(body.maximum_value),
    maximum_mileage: cleanPositiveNumber(body.maximum_mileage),
    minimum_engine_cc: cleanPositiveNumber(body.minimum_engine_cc),
    maximum_engine_cc: cleanPositiveNumber(body.maximum_engine_cc),
    accepts_non_running: cleanBoolean(body.accepts_non_running),
    accepts_insurance_category: cleanBoolean(body.accepts_insurance_category),
    accepts_outstanding_finance: cleanBoolean(body.accepts_outstanding_finance),
    accepts_imported: cleanBoolean(body.accepts_imported),
    accepts_modified: cleanBoolean(body.accepts_modified),
  };
}

export function cleanDealerGeographyPreferencesPayload(body: Record<string, unknown>, dealerAccountId: string) {
  return {
    dealer_account_id: dealerAccountId,
    england: cleanBoolean(body.england),
    wales: cleanBoolean(body.wales),
    scotland: cleanBoolean(body.scotland),
    northern_ireland: cleanBoolean(body.northern_ireland),
    republic_of_ireland: cleanBoolean(body.republic_of_ireland),
    maximum_radius_miles: cleanPositiveNumber(body.maximum_radius_miles),
  };
}

export function cleanDealerSelfAccountPayload(body: Record<string, unknown>) {
  return {
    trading_address: cleanText(body.trading_address, 600),
    main_contact: cleanText(body.main_contact, 160),
    telephone: cleanText(body.telephone, 80),
    mobile_whatsapp: cleanText(body.mobile_whatsapp, 80),
    main_email: cleanText(body.main_email, 180),
    accounts_email: cleanText(body.accounts_email, 180),
    website: cleanText(body.website, 240),
    postcode: cleanText(body.postcode, 30),
  };
}

export async function withDealerPreferences(account: DealerPortalAccount): Promise<DealerPortalAccountWithPreferences> {
  const db = getSupabaseAdminClient();
  const [buying, geography] = await Promise.all([
    db.from("dealer_buying_preferences").select("*").eq("dealer_account_id", account.id).maybeSingle(),
    db.from("dealer_geography_preferences").select("*").eq("dealer_account_id", account.id).maybeSingle(),
  ]);
  return {
    ...account,
    buying_preferences: buying.data ? buying.data as DealerBuyingPreferences : defaultBuyingPreferences(account.id),
    geography_preferences: geography.data ? geography.data as DealerGeographyPreferences : defaultGeographyPreferences(account.id),
  };
}

export async function withDealerPreferencesList(accounts: DealerPortalAccount[]): Promise<DealerPortalAccountWithPreferences[]> {
  if (!accounts.length) return [];
  const ids = accounts.map(account => account.id);
  const db = getSupabaseAdminClient();
  const [buying, geography] = await Promise.all([
    db.from("dealer_buying_preferences").select("*").in("dealer_account_id", ids),
    db.from("dealer_geography_preferences").select("*").in("dealer_account_id", ids),
  ]);
  const buyingByDealer = new Map((buying.data ?? []).map(row => [String(row.dealer_account_id), row as DealerBuyingPreferences]));
  const geographyByDealer = new Map((geography.data ?? []).map(row => [String(row.dealer_account_id), row as DealerGeographyPreferences]));
  return accounts.map(account => ({
    ...account,
    buying_preferences: buyingByDealer.get(account.id) ?? defaultBuyingPreferences(account.id),
    geography_preferences: geographyByDealer.get(account.id) ?? defaultGeographyPreferences(account.id),
  }));
}

export async function saveDealerPreferencePayloads(dealerAccountId: string, body: Record<string, unknown>, actorUserId?: string | null) {
  const db = getSupabaseAdminClient();
  if (body.buying_preferences && typeof body.buying_preferences === "object") {
    const previous = await db.from("dealer_buying_preferences").select("*").eq("dealer_account_id", dealerAccountId).maybeSingle();
    const payload = cleanDealerBuyingPreferencesPayload(body.buying_preferences as Record<string, unknown>, dealerAccountId);
    await db.from("dealer_buying_preferences").upsert(payload, { onConflict: "dealer_account_id" }).throwOnError();
    const changes = changedFieldSummary(previous.data as Record<string, unknown> | null, payload, dealerBuyingPreferenceAuditFields);
    if (Object.keys(changes).length) {
      await recordDealerPortalAuditEvent({
        eventType: "dealer_buying_preferences_updated",
        dealerAccountId,
        dealerUserId: actorUserId ?? null,
        eventData: { changed_fields: Object.keys(changes), changes },
      });
    }
  }
  if (body.geography_preferences && typeof body.geography_preferences === "object") {
    const previous = await db.from("dealer_geography_preferences").select("*").eq("dealer_account_id", dealerAccountId).maybeSingle();
    const payload = cleanDealerGeographyPreferencesPayload(body.geography_preferences as Record<string, unknown>, dealerAccountId);
    await db.from("dealer_geography_preferences").upsert(payload, { onConflict: "dealer_account_id" }).throwOnError();
    const changes = changedFieldSummary(previous.data as Record<string, unknown> | null, payload, dealerGeographyPreferenceAuditFields);
    if (Object.keys(changes).length) {
      await recordDealerPortalAuditEvent({
        eventType: "dealer_geography_preferences_updated",
        dealerAccountId,
        dealerUserId: actorUserId ?? null,
        eventData: { changed_fields: Object.keys(changes), changes },
      });
    }
  }
}

export function dealerSelfAccountChangeSummary(previous: Record<string, unknown> | null | undefined, next: Record<string, unknown>) {
  return changedFieldSummary(previous, next, dealerSelfAccountAuditFields);
}

export function dealerStaffAccountChangeSummary(previous: Record<string, unknown> | null | undefined, next: Record<string, unknown>) {
  return changedFieldSummary(previous, next, dealerStaffAccountAuditFields);
}

export async function getDealerClaimForSession(claimId: string) {
  const session = await getCurrentDealerPortalAccount();
  if (!session) return { session: null, claim: null };
  const { data, error } = await getSupabaseAdminClient()
    .from("dealer_lead_claims")
    .select("*")
    .eq("id", claimId)
    .eq("dealer_account_id", session.dealer.id)
    .maybeSingle();
  if (error || !data) return { session, claim: null };
  return { session, claim: data as DealerLeadClaim };
}
