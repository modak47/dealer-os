import "server-only";

import { cookies } from "next/headers";
import { createToken, tokenHash } from "./secure-token";
import { cleanText, isValidPostcode, normalisePostcode, normaliseRegistration, numberOrNull } from "./text";
import { getSupabaseAdmin } from "./supabase-server";

export const draftCookie = "mg_valuation_draft";
export const sellerSessionCookie = "mg_seller_session";
export const photoBucket = process.env.MOTORGEEKS_PHOTO_BUCKET || "motorgeeks-seller-photos";

export type DraftPayload = {
  currentStep?: number;
  registration?: string;
  vehicle?: Record<string, unknown>;
  condition?: Record<string, unknown>;
  seller?: Record<string, unknown>;
};

export async function ensureDraft() {
  const jar = await cookies();
  const existing = jar.get(draftCookie)?.value;
  if (existing) {
    const draft = await draftByToken(existing);
    if (draft) return { token: existing, draft };
  }
  const token = createToken();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("seller_valuation_drafts").insert({
    draft_token_hash: tokenHash(token),
    expires_at: expires.toISOString(),
  }).select("*").single();
  if (error) throw new Error(error.message);
  jar.set(draftCookie, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires });
  return { token, draft: data as Record<string, unknown> };
}

export async function draftByToken(token: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("seller_valuation_drafts")
    .select("*")
    .eq("draft_token_hash", tokenHash(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

export async function saveDraft(input: DraftPayload) {
  const { draft } = await ensureDraft();
  const vehicle = safeObject(input.vehicle);
  const condition = safeObject(input.condition);
  const seller = safeObject(input.seller);
  const update = {
    current_step: clampStep(input.currentStep ?? Number(draft.current_step ?? 1)),
    registration: normaliseRegistration(input.registration ?? vehicle.registration ?? draft.registration),
    vehicle_snapshot: { ...safeObject(draft.vehicle_snapshot), ...vehicle },
    condition_snapshot: { ...safeObject(draft.condition_snapshot), ...condition },
    seller_snapshot: { ...safeObject(draft.seller_snapshot), ...seller },
    last_autosaved_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabaseAdmin()
    .from("seller_valuation_drafts")
    .update(update)
    .eq("id", draft.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

export async function submitDraft() {
  const { draft } = await ensureDraft();
  const vehicle = safeObject(draft.vehicle_snapshot);
  const condition = safeObject(draft.condition_snapshot);
  const seller = safeObject(draft.seller_snapshot);
  const errors = validateSubmission(vehicle, condition, seller);
  if (errors.length) return { ok: false as const, errors };
  const db = getSupabaseAdmin();
  const registration = normaliseRegistration(vehicle.registration ?? draft.registration);
  const now = new Date().toISOString();
  const leadPayload = {
    lead_source: "motorgeeks",
    website: "motorgeeks",
    form_name: "MotorGeeks seller valuation",
    opportunity_mode: "marketplace_offer",
    marketplace_status: "submitted",
    marketplace_submitted_at: now,
    status: "reviewing",
    owner: cleanText(condition.registeredKeeper, 120),
    reg: registration,
    make: cleanText(vehicle.make, 120),
    model: cleanText(vehicle.model, 120),
    year: cleanText(vehicle.year, 20),
    engine: cleanText(vehicle.engineCapacity, 60),
    colour: cleanText(vehicle.colour, 80),
    mileage: cleanText(condition.mileage, 30),
    owners: cleanText(condition.previousOwners, 30),
    spare_keys: cleanText(condition.spareKeys, 30),
    bike_condition: cleanText(condition.overallCondition, 80),
    damage: cleanText(condition.cosmeticDamage === "yes" ? condition.damageDescription : "", 1000),
    history: cleanText(condition.serviceHistory, 120),
    service: cleanText([condition.lastServiceDate, condition.mileageAtLastService].filter(Boolean).join(" / "), 160),
    mot: cleanText(condition.motExpiry || vehicle.motExpiry, 80),
    extras: cleanText(condition.fittedExtras, 1000),
    finance_information: cleanText(condition.outstandingFinance, 60),
    customer_message: cleanText(condition.faultDescription, 1000),
    fname: cleanText(seller.firstName, 80),
    lname: cleanText(seller.lastName, 80),
    email: cleanText(seller.email, 180).toLowerCase(),
    phone: cleanText(seller.mobile, 80),
    postcode: normalisePostcode(seller.postcode),
    normalised_postcode: normalisePostcode(seller.postcode),
    autotrader_vehicle_id: cleanText(vehicle.vehicleId, 120),
    autotrader_vehicle_lookup_data: safeObject(vehicle.lookupRaw),
    autotrader_vehicle_check_data: safeObject(vehicle.checkRaw),
    vehicle_check_status: vehicle.lookupRaw ? "checked" : "not_checked",
    vehicle_check_checked_at: vehicle.lookupRaw ? now : null,
    seller_vehicle_snapshot: vehicle,
    seller_condition: condition,
    seller_profile: seller,
    seller_progress: { submittedStep: 4, photosSkipped: Boolean(condition.photosSkipped) },
    raw_payload: { vehicle, condition, seller, source: "motorgeeks_public" },
    consent_terms: true,
    consent_source: "motorgeeks_valuation_form",
    submitted_at: now,
    date: now,
  };
  const { data: lead, error } = await db.from("website_leads").insert(leadPayload).select("*").single();
  if (error) throw new Error(error.message);
  await db.from("seller_valuation_drafts").update({ website_lead_id: lead.id, submitted_at: now, current_step: 4 }).eq("id", draft.id);
  await db.from("lead_photos").update({ website_lead_id: lead.id }).eq("draft_id", draft.id);
  await db.from("dealer_portal_audit_events").insert({
    website_lead_id: lead.id,
    event_type: "motorgeeks_seller_profile_submitted",
    event_data: { source: "motorgeeks", opportunity_mode: "marketplace_offer" },
  });
  const access = await createSellerAccessToken(Number(lead.id));
  return { ok: true as const, lead, access };
}

export async function createSellerAccessToken(websiteLeadId: number) {
  const token = createToken();
  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const { error } = await getSupabaseAdmin().from("seller_access_tokens").insert({
    website_lead_id: websiteLeadId,
    token_hash: tokenHash(token),
    expires_at: expires.toISOString(),
  });
  if (error) throw new Error(error.message);
  return { token, expires };
}

export async function sellerLeadFromSession() {
  const jar = await cookies();
  const token = jar.get(sellerSessionCookie)?.value;
  if (!token) return null;
  const { data: access, error } = await getSupabaseAdmin()
    .from("seller_access_tokens")
    .select("website_lead_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash(token))
    .eq("purpose", "seller_session")
    .gt("expires_at", new Date().toISOString())
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !access) return null;
  const db = getSupabaseAdmin();
  const [lead, photos, offers] = await Promise.all([
    db.from("website_leads").select("*").eq("id", access.website_lead_id).maybeSingle(),
    db.from("lead_photos").select("*").eq("website_lead_id", access.website_lead_id).neq("status", "removed").order("sort_order"),
    db.from("dealer_offers").select("id,amount_pence,note,status,submitted_at,revised_at,dealer:dealer_portal_accounts(trading_name)").eq("website_lead_id", access.website_lead_id).in("status", ["submitted", "viewed", "accepted"]).order("submitted_at", { ascending: false }),
  ]);
  if (lead.error || !lead.data) return null;
  const signedPhotos = [];
  for (const photo of photos.data ?? []) {
    const signed = await db.storage.from(photo.storage_bucket).createSignedUrl(photo.storage_path, 60 * 15);
    signedPhotos.push({ ...photo, signed_url: signed.data?.signedUrl ?? null });
  }
  return { lead: lead.data, photos: signedPhotos, offers: offers.data ?? [] };
}

export async function verifySellerMagicToken(token: string) {
  const hash = tokenHash(token);
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("seller_access_tokens")
    .select("*")
    .eq("token_hash", hash)
    .eq("purpose", "seller_magic_link")
    .gt("expires_at", new Date().toISOString())
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const sessionToken = createToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.from("seller_access_tokens").insert({
    website_lead_id: data.website_lead_id,
    token_hash: tokenHash(sessionToken),
    purpose: "seller_session",
    expires_at: expires.toISOString(),
    used_at: new Date().toISOString(),
  });
  await db.from("seller_access_tokens").update({ used_at: new Date().toISOString() }).eq("id", data.id);
  return { sessionToken, expires };
}

export async function acceptSellerOffer(offerId: string) {
  const context = await sellerLeadFromSession();
  if (!context) return { ok: false as const, status: 401, error: "Your secure seller session has expired." };
  const { data, error } = await getSupabaseAdmin().rpc("seller_accept_marketplace_offer", {
    p_website_lead_id: context.lead.id,
    p_offer_id: offerId,
  });
  if (error) return { ok: false as const, status: 409, error: error.message };
  return { ok: true as const, offer: data };
}

function validateSubmission(vehicle: Record<string, unknown>, condition: Record<string, unknown>, seller: Record<string, unknown>) {
  const errors: string[] = [];
  if (!normaliseRegistration(vehicle.registration) && (!cleanText(vehicle.make) || !cleanText(vehicle.model) || !cleanText(vehicle.year))) errors.push("Add the motorcycle registration or manual make, model and year.");
  if (numberOrNull(condition.mileage) == null) errors.push("Mileage is required.");
  if (!cleanText(condition.overallCondition)) errors.push("Overall condition is required.");
  if (!cleanText(condition.serviceHistory)) errors.push("Service history is required.");
  if (!cleanText(seller.firstName)) errors.push("First name is required.");
  if (!cleanText(seller.lastName)) errors.push("Last name is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanText(seller.email))) errors.push("A valid email address is required.");
  if (!cleanText(seller.mobile)) errors.push("Mobile number is required.");
  if (!isValidPostcode(seller.postcode)) errors.push("A valid UK postcode is required.");
  if (seller.consent !== true) errors.push("You must agree to the MotorGeeks privacy and terms notice.");
  return errors;
}

function clampStep(value: number) {
  return Math.min(4, Math.max(1, Math.round(value || 1)));
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
