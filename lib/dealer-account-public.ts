// Explicit projection at both the database and HTTP response boundary.
export const dealerAccountFields = [
  "id", "trading_name", "limited_company_name", "company_registration_number", "vat_number",
  "registered_address", "trading_address", "main_contact", "telephone", "mobile_whatsapp",
  "main_email", "accounts_email", "website", "postcode", "latitude", "longitude",
  "account_status", "successful_purchase_fee", "attribution_period_days", "claim_expiry_hours",
  "update_deadline_hours", "created_at", "updated_at",
] as const;
export const dealerAccountSelect = "id,trading_name,limited_company_name,company_registration_number,vat_number,registered_address,trading_address,main_contact,telephone,mobile_whatsapp,main_email,accounts_email,website,postcode,latitude,longitude,account_status,successful_purchase_fee,attribution_period_days,claim_expiry_hours,update_deadline_hours,created_at,updated_at";
const buyingFields = ["dealer_account_id", "motorcycle_types", "makes_wanted", "makes_excluded", "models_wanted", "minimum_year", "maximum_age_years", "minimum_value", "maximum_value", "maximum_mileage", "minimum_engine_cc", "maximum_engine_cc", "accepts_non_running", "accepts_insurance_category", "accepts_outstanding_finance", "accepts_imported", "accepts_modified"];
const geographyFields = ["dealer_account_id", "england", "wales", "scotland", "northern_ireland", "republic_of_ireland", "maximum_radius_miles"];
function pick(value: unknown, fields: readonly string[]) {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(fields.filter(key => key in source).map(key => [key, source[key]]));
}
export function dealerAccountResponse(value: unknown) {
  const account = pick(value, dealerAccountFields);
  if (!account) return null;
  const source = value as Record<string, unknown>;
  return { ...account, buying_preferences: pick(source.buying_preferences, buyingFields), geography_preferences: pick(source.geography_preferences, geographyFields) };
}
