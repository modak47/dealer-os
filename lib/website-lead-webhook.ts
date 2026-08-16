import { createHash } from "crypto";
import { z } from "zod";
import { cleanText, safeNumber } from "@/lib/website-leads";
import type { WebsiteLeadStatus } from "@/types/website-lead";

export const webhookSources = ["bike_buyer_uk", "sell_your_motorbike"] as const;
export type WebhookLeadSource = typeof webhookSources[number];

export type CanonicalWebsiteLead = {
  external_submission_id: string;
  lead_source: WebhookLeadSource;
  form_name: string | null;
  submitted_at: string;
  status: WebsiteLeadStatus;
  valuation_status: string;
  owner: string | null;
  reg: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  engine: string | null;
  colour: string | null;
  mileage: string | null;
  owners: string | null;
  spare_keys: string | null;
  bike_condition: string | null;
  damage: string | null;
  history: string | null;
  service: string | null;
  mot: string | null;
  extras: string | null;
  price: string | null;
  finance_information: string | null;
  customer_message: string | null;
  fname: string | null;
  lname: string | null;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  image1: string | null;
  image2: string | null;
  image3: string | null;
  image4: string | null;
  image5: string | null;
  image6: string | null;
  image7: string | null;
  image8: string | null;
  image9: string | null;
  image10: string | null;
  images: string[] | null;
  website: string;
  date: string;
  consent_marketing: boolean | null;
  consent_terms: boolean | null;
  consent_source: string | null;
  raw_payload: Record<string, unknown>;
};

const loosePayloadSchema = z.record(z.string(), z.unknown());

const envelopeSchema = loosePayloadSchema.transform(input => {
  const source = normaliseSource(first(input, ["source", "lead_source"])) ?? normaliseWebsiteSource(first(input, ["website"])) ?? "sell_your_motorbike";
  return { source, input };
});

export function parseWebsiteLeadWebhookPayload(body: unknown): CanonicalWebsiteLead {
  const parsed = envelopeSchema.parse(body);
  const payload = parsed.input;
  const submittedAt = normaliseTimestamp(first(payload, ["submitted_at", "submittedAt", "date", "created_at"])) ?? new Date().toISOString();
  const suppliedExternalId = cleanText(first(payload, ["external_submission_id", "externalSubmissionId", "application_id", "applicationId", "field_id", "id"]), 160);
  const externalId = suppliedExternalId ?? stableSubmissionId(parsed.source, submittedAt, payload);
  const images = collectImages(payload);
  const email = normaliseEmail(first(payload, ["email", "customer_email"]));
  const phone = normaliseUkPhone(first(payload, ["phone", "telephone", "mobile", "customer_phone"]));
  const postcode = normalisePostcode(first(payload, ["postcode", "post_code", "customer_postcode"]));
  const reg = normaliseRegistration(first(payload, ["reg", "registration", "vrm", "vehicle_registration", "application_reg"]));
  const firstName = cleanText(first(payload, ["fname", "first_name", "firstname", "firstName", "customer_first_name"]), 100);
  const lastName = cleanText(first(payload, ["lname", "last_name", "lastname", "lastName", "customer_last_name"]), 100);
  const meaningfulDetails = [reg, first(payload, ["make"]), first(payload, ["model"]), email, phone, postcode, firstName, lastName].filter(Boolean).length;
  if (!suppliedExternalId && !reg && meaningfulDetails < 2) throw new Error("Lead must include a row id, registration, or meaningful bike/customer details.");

  return {
    external_submission_id: externalId,
    lead_source: parsed.source,
    form_name: cleanText(first(payload, ["form_name", "formName"]), 120),
    submitted_at: submittedAt,
    status: "new",
    valuation_status: cleanText(payload.valuation_status, 80) ?? "pending",
    owner: cleanText(first(payload, ["owner", "application_owner"]), 120),
    reg,
    make: cleanText(first(payload, ["make", "vehicle_make", "application_make"]), 80),
    model: cleanText(first(payload, ["model", "vehicle_model", "application_model"]), 120),
    year: cleanText(first(payload, ["year", "vehicle_year"]), 20),
    engine: cleanText(first(payload, ["engine", "engine_size", "cc"]), 60),
    colour: cleanText(first(payload, ["colour", "color"]), 60),
    mileage: cleanText(first(payload, ["mileage", "miles"]), 40),
    owners: cleanText(first(payload, ["owners", "previous_owners"]), 40),
    spare_keys: cleanText(first(payload, ["spare_keys", "spareKeys", "keys"]), 40),
    bike_condition: cleanText(first(payload, ["bike_condition", "condition"]), 500),
    damage: cleanText(first(payload, ["damage", "damage_notes"]), 1000),
    history: cleanText(first(payload, ["history", "service_history_type"]), 1000),
    service: cleanText(first(payload, ["service", "service_history"]), 1000),
    mot: cleanText(first(payload, ["mot", "mot_expiry"]), 120),
    extras: cleanText(first(payload, ["extras", "modifications", "accessories"]), 1000),
    price: cleanText(first(payload, ["price", "asking_price", "expected_price", "valuation_price"]), 80),
    finance_information: cleanText(first(payload, ["finance_information", "finance", "outstanding_finance"]), 2000),
    customer_message: cleanText(first(payload, ["message", "customer_message", "notes"]), 4000),
    fname: firstName,
    lname: lastName,
    email,
    phone,
    postcode,
    image1: images[0] ?? null,
    image2: images[1] ?? null,
    image3: images[2] ?? null,
    image4: images[3] ?? null,
    image5: images[4] ?? null,
    image6: images[5] ?? null,
    image7: images[6] ?? null,
    image8: images[7] ?? null,
    image9: images[8] ?? null,
    image10: images[9] ?? null,
    images: images.length ? images : null,
    website: parsed.source === "bike_buyer_uk" ? "bikebuyeruk" : "sellyourmotorbike",
    date: submittedAt,
    consent_marketing: normaliseBoolean(first(payload, ["consent_marketing", "marketing_consent"])),
    consent_terms: normaliseBoolean(first(payload, ["consent_terms", "terms_consent", "privacy_consent"])),
    consent_source: cleanText(first(payload, ["consent_source", "consent"]), 500),
    raw_payload: payload,
  };
}

export function websiteLeadInsertPayload(lead: CanonicalWebsiteLead) {
  return {
    ...lead,
    images: lead.images ?? [],
    retail_estimate: null,
    suggested_offer: safeNumber(lead.price),
    estimated_margin: null,
    internal_notes: null,
    assigned_to: null,
  };
}

export function normaliseSource(value: unknown): WebhookLeadSource | null {
  const text = cleanText(value, 80)?.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (text === "bikebuyeruk" || text === "bike_buyer_uk") return "bike_buyer_uk";
  if (text === "sellyourmotorbike" || text === "sell_your_motorbike") return "sell_your_motorbike";
  if (text === "yesmoto" || text === "yes_moto" || text === "yesmoto_co_uk") return "sell_your_motorbike";
  return null;
}

function normaliseWebsiteSource(value: unknown): WebhookLeadSource | null {
  const text = cleanText(value, 120)?.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!text) return null;
  if (text.includes("bikebuyer") || text.includes("bike_buyer")) return "bike_buyer_uk";
  return normaliseSource(text) ?? "sell_your_motorbike";
}

export function stableSubmissionId(source: string, submittedAt: string, payload: Record<string, unknown>) {
  const identity = [
    source,
    submittedAt,
    normaliseRegistration(first(payload, ["reg", "registration", "vrm"])) ?? "",
    normaliseEmail(first(payload, ["email", "customer_email"])) ?? "",
    normaliseUkPhone(first(payload, ["phone", "telephone", "mobile"])) ?? "",
  ].join("|");
  return createHash("sha256").update(identity).digest("hex").slice(0, 32);
}

function first(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const exactValue = payload[key];
    if (exactValue !== undefined && exactValue !== null && exactValue !== "") return exactValue;
  }

  const normalised = new Map<string, unknown>();
  for (const [payloadKey, value] of Object.entries(payload)) {
    normalised.set(normalisePayloadKey(payloadKey), value);
  }

  for (const key of keys) {
    const value = normalised.get(normalisePayloadKey(key));
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function normalisePayloadKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function collectImages(payload: Record<string, unknown>) {
  const values = [
    ...(Array.isArray(payload.images) ? payload.images : []),
    ...Array.from({ length: 10 }, (_, index) => payload[`image${index + 1}`]),
  ];
  const seen = new Set<string>();
  return values.flatMap(value => cleanText(value, 1000) ?? []).filter(value => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  }).slice(0, 10);
}

function normaliseEmail(value: unknown) {
  return cleanText(value, 160)?.toLowerCase() ?? null;
}

export function normaliseRegistration(value: unknown) {
  return cleanText(value, 30)?.replace(/\s+/g, "").toUpperCase() ?? null;
}

function normalisePostcode(value: unknown) {
  const compact = cleanText(value, 30)?.replace(/\s+/g, "").toUpperCase();
  if (!compact) return null;
  return compact.length > 3 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact;
}

function normaliseUkPhone(value: unknown) {
  const text = cleanText(value, 80);
  if (!text) return null;
  const digits = text.replace(/[^\d+]/g, "");
  if (digits.startsWith("+44")) return `0${digits.slice(3)}`;
  if (digits.startsWith("44") && digits.length > 10) return `0${digits.slice(2)}`;
  return digits;
}

function normaliseTimestamp(value: unknown) {
  const text = cleanText(value, 80);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normaliseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = cleanText(value, 20)?.toLowerCase();
  if (!text) return null;
  if (["true", "yes", "y", "1", "on"].includes(text)) return true;
  if (["false", "no", "n", "0", "off"].includes(text)) return false;
  return null;
}
