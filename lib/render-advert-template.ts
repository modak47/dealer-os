import { ADVERT_TEMPLATE_PLACEHOLDER_KEYS, type AdvertTemplatePlaceholderKey } from "@/lib/advert-template-placeholders";

export type AdvertTemplateBikeData = {
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  year?: number | string | null;
  registration?: string | null;
  mileage?: number | string | null;
  price?: number | string | null;
  colour?: string | null;
  engine_cc?: number | string | null;
  previous_owners?: number | string | null;
  mot_months?: number | string | null;
  warranty_months?: number | string | null;
  service_history?: string | null;
  body_style?: string | null;
  category?: string | null;
  dealer_name?: string | null;
  phone?: string | null;
  reservation_amount?: number | string | null;
};

export type RenderAdvertTemplateOptions = {
  unresolvedMode?: "empty" | "keep" | "error";
};

export function renderAdvertTemplate(template: string, bike: AdvertTemplateBikeData, options: RenderAdvertTemplateOptions = {}) {
  const unresolvedMode = options.unresolvedMode ?? "empty";
  const unresolvedTokens: string[] = [];
  const values = placeholderValues(bike);
  let text = String(template ?? "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, rawKey: string) => {
    const key = rawKey.toLowerCase() as AdvertTemplatePlaceholderKey;
    if (!ADVERT_TEMPLATE_PLACEHOLDER_KEYS.has(key)) {
      unresolvedTokens.push(match);
      if (unresolvedMode === "error") return match;
      return unresolvedMode === "keep" ? match : "";
    }
    const value = values[key] ?? "";
    if (!value) unresolvedTokens.push(match);
    if (value) return value;
    if (unresolvedMode === "error" || unresolvedMode === "keep") return match;
    return "";
  });

  text = cleanupAdvertTemplateText(text);
  return { text, unresolvedTokens: Array.from(new Set(unresolvedTokens)) };
}

export function validateAdvertTemplateSyntax(template: string) {
  const unknownTokens: string[] = [];
  const malformedTokens: string[] = [];
  const text = String(template ?? "");
  const recognisedRanges: [number, number][] = [];
  for (const match of text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
    recognisedRanges.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
    if (!ADVERT_TEMPLATE_PLACEHOLDER_KEYS.has(match[1].toLowerCase() as AdvertTemplatePlaceholderKey)) unknownTokens.push(match[0]);
  }
  for (const match of text.matchAll(/\{\{[^}]*$|^[^{]*\}\}|\{[^{][^}]*\}|\{\{\s*[^a-z0-9_\s}]+/gi)) {
    const index = match.index ?? 0;
    if (!recognisedRanges.some(([start, end]) => index >= start && index < end)) malformedTokens.push(match[0]);
  }
  return { unknownTokens: Array.from(new Set(unknownTokens)), malformedTokens: Array.from(new Set(malformedTokens)) };
}

export function cleanupAdvertTemplateText(value: string) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.replace(/\{\{\s*[a-z0-9_]+\s*\}\}/gi, "").replace(/[ \t]+/g, " ").trimEnd())
    .filter(line => line.trim() !== "@@")
    .join("\n")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\b(?:a|an)\s+[-–]?\s*-month warranty\b/gi, "a warranty")
    .replace(/\bwith\s+months MOT\b/gi, "with MOT")
    .replace(/\bwith\s+a\s+-month warranty\b/gi, "with a warranty")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripUnsafeAdvertText(value: unknown) {
  return cleanupAdvertTemplateText(String(value ?? ""))
    .replace(/\{\{\s*[a-z0-9_]+\s*\}\}/gi, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function placeholderValues(bike: AdvertTemplateBikeData): Record<AdvertTemplatePlaceholderKey, string> {
  const make = clean(bike.make);
  const model = clean(bike.model);
  const variant = clean(bike.variant);
  const year = clean(bike.year);
  const bikeName = [make, model, variant].filter(Boolean).join(" ");
  const motMonths = clean(bike.mot_months) || "12";
  const warrantyMonths = clean(bike.warranty_months) || "3";
  return {
    bike_name: bikeName,
    make,
    model,
    variant,
    year,
    registration: clean(bike.registration),
    mileage: formatNumber(bike.mileage),
    price: formatMoney(bike.price),
    colour: clean(bike.colour),
    engine_cc: formatEngine(bike.engine_cc),
    owners: clean(bike.previous_owners),
    mot_months: motMonths,
    warranty_months: warrantyMonths,
    service_history: clean(bike.service_history),
    vehicle_type: clean(bike.body_style) || clean(bike.category) || "motorcycle",
    dealer_name: clean(bike.dealer_name) || "YesMoto",
    phone: clean(bike.phone),
    deposit_amount: formatMoney(bike.reservation_amount) || "£99",
  };
}

function clean(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function formatNumber(value: unknown) {
  const parsed = parseNumeric(value);
  return parsed === null ? clean(value) : Math.round(parsed).toLocaleString("en-GB");
}

function formatMoney(value: unknown) {
  const parsed = parseNumeric(value);
  if (parsed === null) return "";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(parsed);
}

function formatEngine(value: unknown) {
  const parsed = parseNumeric(value);
  if (parsed === null) return clean(value);
  return `${Math.round(parsed).toLocaleString("en-GB")}cc`;
}

function parseNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
