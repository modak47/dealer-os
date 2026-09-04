export const dealerSafeLeadFields = [
  "id",
  "public_id",
  "owner",
  "reg",
  "make",
  "model",
  "year",
  "engine",
  "colour",
  "mileage",
  "owners",
  "spare_keys",
  "bike_condition",
  "damage",
  "history",
  "service",
  "mot",
  "extras",
  "price",
  "finance_information",
  "customer_message",
  "image1",
  "image2",
  "image3",
  "image4",
  "image5",
  "image6",
  "image7",
  "image8",
  "image9",
  "image10",
  "Images",
  "images",
  "resolved_images",
  "website",
  "date",
  "created_at",
  "updated_at",
  "location_town",
  "status",
] as const;

export const dealerClaimedCustomerLeadFields = [
  "fname",
  "lname",
  "email",
  "phone",
  "postcode",
  "normalised_postcode",
  "location_display_name",
  "latitude",
  "longitude",
] as const;

const dealerFreeTextLeadFields = [
  "owner",
  "bike_condition",
  "damage",
  "history",
  "service",
  "mot",
  "extras",
  "finance_information",
  "customer_message",
] as const;

export const yesMotoInternalLeadFields = [
  "external_submission_id",
  "lead_source",
  "form_name",
  "geocoding_status",
  "geocoding_provider",
  "location_checked_at",
  "location_lookup_error",
  "distance_from_yesmoto_miles",
  "driving_distance_miles",
  "estimated_drive_minutes",
  "valuation_status",
  "retail_estimate",
  "suggested_offer",
  "estimated_margin",
  "similar_bikes",
  "auto_trader_search",
  "valuation_notes",
  "Motorway output",
  "retail_check_id",
  "stock_bike_id",
  "purchase_agreed_at",
  "latest_referral_id",
  "latest_referred_dealer_id",
  "latest_referred_dealer_name",
  "latest_referred_at",
  "referral_count",
  "valuation_started_at",
  "valuation_completed_at",
  "valuation_error",
  "autotrader_vehicle_id",
  "autotrader_vehicle_lookup_data",
  "autotrader_vehicle_check_data",
  "vehicle_check_status",
  "vehicle_check_checked_at",
  "vehicle_check_error",
  "assigned_to",
  "contacted_at",
  "offer_made_at",
  "purchased_at",
  "internal_notes",
  "raw_payload",
  "consent_marketing",
  "consent_terms",
  "consent_source",
  "submitted_at",
] as const;

export const dealerRouteSourceOnlyLeadFields = [
  "autotrader_vehicle_id",
  "autotrader_vehicle_lookup_data",
  "autotrader_vehicle_check_data",
  "vehicle_check_status",
  "vehicle_check_checked_at",
] as const;

export const dealerLeadSourceFields = [
  ...dealerSafeLeadFields.filter(field => field !== "resolved_images"),
  ...dealerClaimedCustomerLeadFields,
  ...dealerRouteSourceOnlyLeadFields,
] as const;

export const dealerLeadSelectClause = dealerLeadSourceFields.join(",");

export function redactLeadForDealer<T extends Record<string, unknown>>(lead: T, unlocked: boolean) {
  const visible: Record<string, unknown> = {};
  for (const field of dealerSafeLeadFields) visible[field] = lead[field];
  if (unlocked) {
    for (const field of dealerClaimedCustomerLeadFields) visible[field] = lead[field];
  } else {
    visible.fname = null;
    visible.lname = null;
    visible.email = null;
    visible.phone = null;
    visible.postcode = lead.location_town ? null : lead.postcode;
    visible.normalised_postcode = null;
    visible.location_display_name = null;
    visible.latitude = null;
    visible.longitude = null;
    for (const field of dealerFreeTextLeadFields) visible[field] = redactFreeTextContactDetails(visible[field], lead);
  }
  return visible as Partial<T>;
}

function redactFreeTextContactDetails(value: unknown, lead: Record<string, unknown>) {
  if (typeof value !== "string" || !value.trim()) return value;
  let text = value;
  const exactContactValues = [
    lead.email,
    lead.phone,
    lead.postcode,
    lead.normalised_postcode,
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);

  for (const contact of exactContactValues) {
    text = text.replace(new RegExp(escapeRegExp(contact.trim()), "gi"), contactRedactionLabel(contact));
  }

  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact hidden]")
    .replace(/(?:\+44\s?|44\s?|0)(?:\d[\s().-]?){9,13}\d/g, "[contact hidden]")
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, "[postcode hidden]");
}

function contactRedactionLabel(value: string) {
  return value.includes("@") ? "[contact hidden]" : /\d/.test(value) && /[A-Za-z]/.test(value) ? "[postcode hidden]" : "[contact hidden]";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
