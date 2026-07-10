import "server-only";

import { customerName, formatMileage } from "@/lib/website-leads";
import type { DealerContact, ReferralDraft, ReferralMethod, ReferralShareOptions } from "@/types/referral";
import type { WebsiteLead } from "@/types/website-lead";

export const defaultReferralShareOptions: ReferralShareOptions = {
  registration: true,
  makeModel: true,
  year: true,
  mileage: true,
  askingPrice: true,
  condition: true,
  serviceHistory: true,
  mot: true,
  town: true,
  partialPostcode: true,
  fullPostcode: false,
  photos: true,
  customerNotes: true,
  customerName: false,
  customerPhone: false,
  customerEmail: false,
  fullAddress: false,
};

const truthy = (value: unknown) => typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
const line = (label: string, value: unknown) => {
  const text = truthy(value);
  return text ? `${label}: ${text}` : "";
};

export function cleanReferralText(value: unknown, max = 12000) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r/g, "").trim().slice(0, max);
}

export function isValidEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

export function normaliseUkPhone(value: string | null | undefined) {
  const raw = truthy(value);
  if (!raw) return null;
  const plus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (plus && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  if (digits.startsWith("44") && digits.length >= 11 && digits.length <= 13) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 10 && digits.length <= 11) return `+44${digits.slice(1)}`;
  return null;
}

export function partialPostcode(value: string | null | undefined) {
  const postcode = truthy(value).toUpperCase();
  return postcode ? postcode.split(/\s+/)[0] : "";
}

export function buildReferralSubject(lead: WebsiteLead) {
  const bike = [lead.year, lead.make, lead.model].map(truthy).filter(Boolean).join(" ");
  return `Motorcycle purchase lead${bike ? ` - ${bike}` : ""}`;
}

export function buildReferralDraft(lead: WebsiteLead, dealer: DealerContact, options: ReferralShareOptions): ReferralDraft {
  const bikeName = [lead.year, lead.make, lead.model].map(truthy).filter(Boolean).join(" ") || "Motorcycle purchase enquiry";
  const contactName = truthy(dealer.contact_name) || truthy(dealer.dealer_name) || "there";
  const location = options.fullPostcode
    ? [lead.location_town, lead.normalised_postcode || lead.postcode].map(truthy).filter(Boolean).join(", ")
    : [lead.location_town, options.partialPostcode ? partialPostcode(lead.normalised_postcode || lead.postcode) : ""].map(truthy).filter(Boolean).join(", ");
  const motorcycleLines = [
    options.makeModel ? bikeName : "",
    options.registration ? line("Registration", lead.reg) : "",
    options.mileage ? line("Mileage", formatMileage(lead.mileage)) : "",
    options.askingPrice ? line("Customer asking price", lead.price) : "",
    (options.town || options.partialPostcode || options.fullPostcode) ? line("Location", location) : "",
  ].filter(Boolean);
  const notes = [
    options.condition ? line("Condition", lead.bike_condition || lead.damage) : "",
    options.serviceHistory ? line("Service history", lead.service || lead.history) : "",
    options.mot ? line("MOT", lead.mot) : "",
    options.customerNotes ? line("Notes", [lead.extras, lead.valuation_notes].map(truthy).filter(Boolean).join(" ")) : "",
  ].filter(Boolean);
  const customerLines = [
    options.customerName ? line("Customer", customerName(lead)) : "",
    options.customerPhone ? line("Phone", lead.phone) : "",
    options.customerEmail ? line("Email", lead.email) : "",
    options.fullAddress ? line("Address", [lead.location_display_name, lead.normalised_postcode || lead.postcode].map(truthy).filter(Boolean).join(", ")) : "",
  ].filter(Boolean);
  const photoLines = options.photos && lead.resolved_images?.length ? ["Photos:", ...lead.resolved_images.slice(0, 10)] : [];
  const body = [
    `Hi ${contactName},`,
    "",
    "We have received the following motorcycle purchase enquiry, but it is not one we are looking to buy at the moment.",
    "",
    "Motorcycle:",
    ...motorcycleLines,
    "",
    ...(notes.length ? ["Condition and notes:", ...notes, ""] : []),
    ...(customerLines.length ? ["Customer contact details:", ...customerLines, ""] : ["Customer contact details:", "Not included.", ""]),
    ...photoLines,
    ...(photoLines.length ? [""] : []),
    "Please contact us or the customer directly if this motorcycle may be of interest.",
    "",
    "Regards,",
    "YesMoto",
  ].filter((value, index, rows) => value !== "" || rows[index - 1] !== "");
  const subject = buildReferralSubject(lead);
  const bodyText = body.join("\n");
  const informationShared = {
    registration: options.registration ? truthy(lead.reg) || null : null,
    motorcycle: options.makeModel ? bikeName : null,
    year: options.year ? truthy(lead.year) || null : null,
    mileage: options.mileage ? truthy(formatMileage(lead.mileage)) || null : null,
    askingPrice: options.askingPrice ? truthy(lead.price) || null : null,
    condition: options.condition ? truthy(lead.bike_condition || lead.damage) || null : null,
    serviceHistory: options.serviceHistory ? truthy(lead.service || lead.history) || null : null,
    mot: options.mot ? truthy(lead.mot) || null : null,
    location,
    photos: options.photos ? lead.resolved_images?.slice(0, 10) ?? [] : [],
  };
  const customerDetailsIncluded = {
    name: options.customerName,
    phone: options.customerPhone,
    email: options.customerEmail,
    fullAddress: options.fullAddress,
  };
  return {
    subject,
    body: bodyText,
    informationShared,
    customerDetailsIncluded,
    mailtoUrl: isValidEmail(dealer.email) ? `mailto:${encodeURIComponent(dealer.email!.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}` : null,
    whatsappUrl: normaliseUkPhone(dealer.whatsapp_number || dealer.mobile_number) ? `https://wa.me/${normaliseUkPhone(dealer.whatsapp_number || dealer.mobile_number)!.replace("+", "")}?text=${encodeURIComponent(bodyText)}` : null,
    smsUrl: normaliseUkPhone(dealer.mobile_number || dealer.whatsapp_number) ? `sms:${encodeURIComponent(normaliseUkPhone(dealer.mobile_number || dealer.whatsapp_number)!)}?&body=${encodeURIComponent(bodyText)}` : null,
  };
}

export function methodStatus(method: ReferralMethod) {
  if (method === "whatsapp") return "Opened in WhatsApp";
  if (method === "sms") return "Opened in SMS";
  return "Prepared";
}

export function requiresCustomerConsent(options: ReferralShareOptions) {
  return options.customerName || options.customerPhone || options.customerEmail || options.fullAddress || options.fullPostcode;
}
