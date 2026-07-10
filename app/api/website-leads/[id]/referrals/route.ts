import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { buildReferralDraft, cleanReferralText, defaultReferralShareOptions, isValidEmail, methodStatus, normaliseUkPhone, requiresCustomerConsent } from "@/lib/referrals";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { combineLeadImages } from "@/lib/website-leads";
import type { DealerContact, ReferralMethod, ReferralShareOptions } from "@/types/referral";
import type { WebsiteLead } from "@/types/website-lead";

export const dynamic = "force-dynamic";

function parseLeadId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function method(value: unknown): ReferralMethod {
  return value === "whatsapp" || value === "sms" ? value : "email";
}

function shareOptions(value: unknown): ReferralShareOptions {
  const body = value && typeof value === "object" ? value as Partial<ReferralShareOptions> : {};
  return { ...defaultReferralShareOptions, ...body };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const { id: rawId } = await params;
  const id = parseLeadId(rawId);
  if (!id) return NextResponse.json({ error: "Invalid lead ID." }, { status: 400 });
  const { data, error } = await getSupabaseAdminClient().from("lead_referrals").select("*,dealer:dealer_contacts(dealer_name,contact_name,email,mobile_number,whatsapp_number,town)").eq("website_lead_id", id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Unable to load referral history." }, { status: 500 });
  return NextResponse.json({ referrals: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const { id: rawId } = await params;
    const id = parseLeadId(rawId);
    if (!id) return NextResponse.json({ error: "Invalid lead ID." }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    const dealerId = typeof body.dealer_contact_id === "string" ? body.dealer_contact_id : "";
    if (!dealerId) return NextResponse.json({ error: "Select a dealer contact." }, { status: 400 });
    const communicationMethod = method(body.communication_method);
    const options = shareOptions(body.share_options);
    const consentSource = cleanReferralText(body.customer_consent_source, 120);
    const consentConfirmed = Boolean(body.customer_consent_confirmed);
    if (requiresCustomerConsent(options) && (!consentConfirmed || !consentSource || consentSource === "Consent not confirmed")) {
      return NextResponse.json({ error: "Confirm customer permission before sharing contact details or full postcode/address." }, { status: 400 });
    }
    const db = getSupabaseAdminClient();
    const [leadResult, dealerResult] = await Promise.all([
      db.from("website_leads").select("*").eq("id", id).maybeSingle(),
      db.from("dealer_contacts").select("*").eq("id", dealerId).maybeSingle(),
    ]);
    if (leadResult.error) return NextResponse.json({ error: "Unable to load website lead." }, { status: 500 });
    if (!leadResult.data) return NextResponse.json({ error: "Website lead not found." }, { status: 404 });
    if (dealerResult.error) return NextResponse.json({ error: "Unable to load dealer contact." }, { status: 500 });
    if (!dealerResult.data) return NextResponse.json({ error: "Dealer contact not found." }, { status: 404 });
    const dealer = dealerResult.data as DealerContact;
    if (!dealer.active) return NextResponse.json({ error: "This dealer contact is inactive." }, { status: 400 });
    const lead = { ...(leadResult.data as WebsiteLead), resolved_images: combineLeadImages(leadResult.data as WebsiteLead) };
    if (communicationMethod === "email" && !isValidEmail(dealer.email)) return NextResponse.json({ error: "Selected dealer does not have a valid email address." }, { status: 400 });
    if (communicationMethod === "whatsapp" && !normaliseUkPhone(dealer.whatsapp_number || dealer.mobile_number)) return NextResponse.json({ error: "Selected dealer does not have a valid WhatsApp/mobile number." }, { status: 400 });
    if (communicationMethod === "sms" && !normaliseUkPhone(dealer.mobile_number || dealer.whatsapp_number)) return NextResponse.json({ error: "Selected dealer does not have a valid mobile number for SMS." }, { status: 400 });
    const draft = buildReferralDraft(lead, dealer, options);
    const subject = cleanReferralText(body.message_subject, 300) || draft.subject;
    const message = cleanReferralText(body.message_body, 12000) || draft.body;
    const userId = await getCurrentUserId();
    const now = new Date().toISOString();
    const referralStatus = methodStatus(communicationMethod);
    const payload = {
      website_lead_id: id,
      dealer_contact_id: dealer.id,
      communication_method: communicationMethod,
      recipient_name: dealer.contact_name || dealer.dealer_name,
      recipient_email: communicationMethod === "email" ? dealer.email : null,
      recipient_phone: communicationMethod === "email" ? null : normaliseUkPhone(communicationMethod === "whatsapp" ? dealer.whatsapp_number || dealer.mobile_number : dealer.mobile_number || dealer.whatsapp_number),
      message_subject: subject,
      message_body: message,
      information_shared: draft.informationShared,
      customer_details_included: draft.customerDetailsIncluded,
      customer_consent_confirmed: consentConfirmed,
      customer_consent_source: consentSource || (requiresCustomerConsent(options) ? null : "Share motorcycle details only"),
      customer_consent_confirmed_at: consentConfirmed ? now : null,
      customer_consent_confirmed_by: consentConfirmed ? userId : null,
      referral_status: referralStatus,
      dealer_outcome: "Awaiting response",
      sent_at: null,
      opened_externally_at: communicationMethod === "email" ? null : now,
      provider: communicationMethod === "email" ? "mailto" : communicationMethod,
      provider_response: { stage: "prepared_external_app" },
      created_by: userId,
      updated_by: userId,
    };
    const { data: referral, error: insertError } = await db.from("lead_referrals").insert(payload).select("*,dealer:dealer_contacts(dealer_name,contact_name,email,mobile_number,whatsapp_number,town)").single();
    if (insertError) return NextResponse.json({ error: `Unable to record referral: ${insertError.message}` }, { status: 500 });
    await Promise.all([
      db.from("website_leads").update({ status: "referred_to_dealer", latest_referral_id: referral.id, latest_referred_dealer_id: dealer.id, latest_referred_dealer_name: dealer.dealer_name, latest_referred_at: now, referral_count: (Number(lead.referral_count) || 0) + 1, updated_at: now }).eq("id", id),
      db.from("dealer_contacts").update({ last_referral_date: now, total_referrals: (Number(dealer.total_referrals) || 0) + 1, updated_by: userId }).eq("id", dealer.id),
    ]);
    return NextResponse.json({
      referral,
      urls: {
        mailto: communicationMethod === "email" ? `mailto:${encodeURIComponent(dealer.email || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}` : null,
        whatsapp: communicationMethod === "whatsapp" ? `https://wa.me/${payload.recipient_phone?.replace("+", "")}?text=${encodeURIComponent(message)}` : null,
        sms: communicationMethod === "sms" ? `sms:${encodeURIComponent(payload.recipient_phone || "")}?&body=${encodeURIComponent(message)}` : null,
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record referral." }, { status: 400 });
  }
}
