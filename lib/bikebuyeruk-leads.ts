import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { parseWebsiteLeadWebhookPayload, websiteLeadInsertPayload } from "@/lib/website-lead-webhook";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).optional();
const integer = (max: number) => z.union([z.number(), z.string().trim().regex(/^\d+$/).transform(Number)])
  .pipe(z.number().int().min(0).max(max));
const photo = z.url().max(1000).refine(value => new URL(value).protocol === "https:", "Photo links must use HTTPS.");

// A deliberately small write-only contract. Unknown fields (including source,
// internal status, valuations and ownership) cannot reach the database.
export const bikeBuyerLeadSchema = z.strictObject({
  external_submission_id: text(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/),
  submitted_at: z.iso.datetime({ offset: true }),
  form_name: text(120).default("BikeBuyerUK valuation"),
  fname: text(100),
  lname: text(100),
  email: z.email().trim().max(160),
  phone: text(40).regex(/^\+?[\d ()-]{10,20}$/),
  postcode: text(12).regex(/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i),
  reg: text(12).regex(/^[a-zA-Z0-9 ]+$/).optional(),
  make: text(80),
  model: text(120),
  year: integer(2100).refine(value => value >= 1900 && value <= new Date().getFullYear() + 1, "Enter a valid vehicle year."),
  mileage: integer(2_000_000),
  engine: optionalText(60),
  colour: optionalText(60),
  owners: integer(100).optional(),
  spare_keys: optionalText(40),
  owner: optionalText(120),
  bike_condition: optionalText(500),
  damage: optionalText(1000),
  history: optionalText(1000),
  service: optionalText(1000),
  mot: optionalText(120),
  extras: optionalText(1000),
  price: z.union([z.number(), z.string().trim().regex(/^\d+(\.\d{1,2})?$/).transform(Number)])
    .pipe(z.number().finite().min(0).max(10_000_000)).optional(),
  finance_information: optionalText(2000),
  customer_message: optionalText(4000),
  images: z.array(photo).max(10).default([]),
  consent_terms: z.literal(true),
  consent_marketing: z.boolean().optional(),
  consent_source: text(500),
  dry_run: z.boolean().default(false),
});

export type BikeBuyerLeadInput = z.input<typeof bikeBuyerLeadSchema>;

export function bikeBuyerLeadPayload(body: unknown) {
  const { dry_run: dryRun, ...input } = bikeBuyerLeadSchema.parse(body);
  const lead = parseWebsiteLeadWebhookPayload({ ...input, source: "bike_buyer_uk" });
  const payload = websiteLeadInsertPayload(lead);
  // An asking price is seller input, not our suggested buying offer.
  payload.suggested_offer = null;
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  payload.raw_payload = { ...input, source: "bike_buyer_uk", integration_payload_hash: hash };
  return { dryRun, hash, payload };
}

export function validBikeBuyerCredential(authorization: string | null, expected: string | undefined) {
  if (!expected || expected.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}
