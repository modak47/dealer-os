import { normaliseVehicleCheck } from "@/lib/autotrader-vehicle-check";
import type { DealerBuyingPreferences, DealerGeographyPreferences, DealerPortalAccountWithPreferences } from "@/types/dealer-portal";

export type DealerEligibilityReason = {
  code: string;
  label: string;
  detail: string;
};

export type DealerEligibilityResult = {
  eligible: boolean;
  passed: DealerEligibilityReason[];
  excluded: DealerEligibilityReason[];
  unknown: DealerEligibilityReason[];
};

export type DealerMatchingLead = {
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
  price?: string | number | null;
  mileage?: string | number | null;
  engine?: string | number | null;
  extras?: string | null;
  postcode?: string | null;
  normalised_postcode?: string | null;
  location_display_name?: string | null;
  location_town?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  autotrader_vehicle_lookup_data?: Record<string, unknown> | null;
  autotrader_vehicle_check_data?: Record<string, unknown> | null;
  vehicle_check_status?: string | null;
};

type DealerMatchAccount = Pick<DealerPortalAccountWithPreferences, "account_status" | "postcode" | "latitude" | "longitude" | "buying_preferences" | "geography_preferences">;

const defaultBuying: DealerBuyingPreferences = {
  dealer_account_id: "",
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

const defaultGeography: DealerGeographyPreferences = {
  dealer_account_id: "",
  england: true,
  wales: true,
  scotland: false,
  northern_ireland: false,
  republic_of_ireland: false,
  maximum_radius_miles: null,
};

const definiteCountriesByPostcodeArea: Record<string, keyof Pick<DealerGeographyPreferences, "england" | "wales" | "scotland" | "northern_ireland">> = {
  AB: "scotland", DD: "scotland", DG: "scotland", EH: "scotland", FK: "scotland", G: "scotland", HS: "scotland", IV: "scotland", KA: "scotland", KW: "scotland", KY: "scotland", ML: "scotland", PA: "scotland", PH: "scotland", ZE: "scotland",
  BT: "northern_ireland",
  CF: "wales", LL: "wales", NP: "wales", SA: "wales",
};

const ambiguousPostcodeAreas = new Set(["CH", "HR", "LD", "SY"]);
const fullPostcodePattern = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;

export function evaluateDealerEligibility(dealer: DealerMatchAccount, lead: DealerMatchingLead, now = new Date()): DealerEligibilityResult {
  const passed: DealerEligibilityReason[] = [];
  const excluded: DealerEligibilityReason[] = [];
  const unknown: DealerEligibilityReason[] = [];
  const buying = { ...defaultBuying, ...(dealer.buying_preferences ?? {}) };
  const geography = { ...defaultGeography, ...(dealer.geography_preferences ?? {}) };

  if (dealer.account_status === "active") passed.push(reason("account_status", "Account status", "Dealer account is active."));
  else excluded.push(reason("account_status", "Account status", "Dealer account is not active."));

  const make = normaliseToken(lead.make);
  evaluateListRule("make_excluded", "Excluded make", make, buying.makes_excluded, false, passed, excluded, unknown);
  evaluateListRule("make_wanted", "Wanted make", make, buying.makes_wanted, true, passed, excluded, unknown);
  evaluateListRule("model_wanted", "Wanted model", normaliseToken(lead.model), buying.models_wanted, true, passed, excluded, unknown);

  unknown.push(reason("motorcycle_type", "Motorcycle type", "No reliable structured motorcycle type is currently stored on the lead."));

  const year = parseWholeNumber(lead.year);
  evaluateMinimum("minimum_year", "Minimum year", year, buying.minimum_year, passed, excluded, unknown);
  const maxAgeYear = buying.maximum_age_years == null ? null : now.getFullYear() - buying.maximum_age_years;
  evaluateMinimum("maximum_age_years", "Maximum age", year, maxAgeYear, passed, excluded, unknown, buying.maximum_age_years == null ? null : `Dealer accepts motorcycles up to ${buying.maximum_age_years} years old.`);

  if (buying.minimum_value != null || buying.maximum_value != null) {
    unknown.push(reason("value_range", "Value range", "V1 does not define whether dealer value limits refer to asking, trade, retail or another valuation."));
  }

  evaluateMaximum("maximum_mileage", "Maximum mileage", parseWholeNumber(lead.mileage), buying.maximum_mileage, passed, excluded, unknown);
  evaluateMinimum("minimum_engine_cc", "Minimum engine size", parseWholeNumber(lead.engine), buying.minimum_engine_cc, passed, excluded, unknown);
  evaluateMaximum("maximum_engine_cc", "Maximum engine size", parseWholeNumber(lead.engine), buying.maximum_engine_cc, passed, excluded, unknown);

  unknown.push(reason("running_status", "Running status", "No reliable structured running/non-running field is currently stored on the lead."));
  unknown.push(reason("modified_status", "Modified bike", "No reliable structured modification flag is currently stored on the lead."));

  const check = normaliseLeadVehicleCheck(lead);
  evaluateAcceptance("insurance_category", "Insurance category", check?.writtenOff ?? null, buying.accepts_insurance_category, "Vehicle check confirms an insurance category/write-off marker.", "Vehicle check confirms no insurance category/write-off marker.", passed, excluded, unknown);
  evaluateAcceptance("outstanding_finance", "Outstanding finance", check?.outstandingFinance ?? null, buying.accepts_outstanding_finance, "Vehicle check confirms outstanding finance.", "Vehicle check confirms no outstanding finance.", passed, excluded, unknown);
  evaluateAcceptance("imported", "Imported bike", check?.imported ?? null, buying.accepts_imported, "Vehicle check confirms imported marker.", "Vehicle check confirms no imported marker.", passed, excluded, unknown);

  const country = inferLeadCountry(lead);
  if (country) {
    if (geography[country]) passed.push(reason("country_region", "Country/region", `Lead is in ${countryLabel(country)}, which this dealer accepts.`));
    else excluded.push(reason("country_region", "Country/region", `Lead is in ${countryLabel(country)}, which this dealer has disabled.`));
  } else {
    unknown.push(reason("country_region", "Country/region", "Lead country/region could not be confidently determined from structured location data."));
  }

  const distance = distanceBetweenDealerAndLead(dealer, lead);
  if (geography.maximum_radius_miles == null) passed.push(reason("maximum_radius", "Buying radius", "Dealer has no maximum buying radius configured."));
  else if (distance == null) unknown.push(reason("maximum_radius", "Buying radius", "Dealer or lead coordinates are unavailable, so buying radius cannot be evaluated."));
  else if (distance > Number(geography.maximum_radius_miles)) excluded.push(reason("maximum_radius", "Buying radius", `${distance.toLocaleString("en-GB", { maximumFractionDigits: 1 })} miles exceeds dealer radius of ${geography.maximum_radius_miles} miles.`));
  else passed.push(reason("maximum_radius", "Buying radius", `${distance.toLocaleString("en-GB", { maximumFractionDigits: 1 })} miles is within dealer radius of ${geography.maximum_radius_miles} miles.`));

  return { eligible: excluded.length === 0, passed, excluded, unknown };
}

export function allocationReasonPayload(result: DealerEligibilityResult, manualOverride = false) {
  return {
    eligible: result.eligible,
    manual_override: manualOverride,
    passed: result.passed,
    unknown: result.unknown,
    warnings: manualOverride && result.excluded.length ? result.excluded : [],
  };
}

export function excludedReasonPayload(result: DealerEligibilityResult) {
  return {
    eligible: false,
    excluded: result.excluded,
    unknown: result.unknown,
  };
}

export function allocationStatusForEligibility(result: DealerEligibilityResult, manualOverride = false) {
  return manualOverride || result.eligible ? "available" : "excluded";
}

function evaluateListRule(code: string, label: string, leadValue: string | null, configuredValues: string[], requireMatch: boolean, passed: DealerEligibilityReason[], excluded: DealerEligibilityReason[], unknown: DealerEligibilityReason[]) {
  const configured = configuredValues.map(normaliseToken).filter((value): value is string => Boolean(value));
  if (!configured.length) {
    passed.push(reason(code, label, `${label} has no restriction configured.`));
    return;
  }
  if (!leadValue) {
    unknown.push(reason(code, label, `Lead ${label.toLowerCase()} is unavailable.`));
    return;
  }
  const matched = configured.includes(leadValue);
  if (!requireMatch && matched) excluded.push(reason(code, label, `Lead matches dealer's excluded ${label.toLowerCase()}.`));
  else if (!requireMatch) passed.push(reason(code, label, `Lead does not match dealer's excluded ${label.toLowerCase()}.`));
  else if (matched) passed.push(reason(code, label, `Lead matches dealer's configured ${label.toLowerCase()}.`));
  else excluded.push(reason(code, label, `Lead does not match dealer's configured ${label.toLowerCase()}.`));
}

function evaluateMinimum(code: string, label: string | null, value: number | null, minimum: number | null, passed: DealerEligibilityReason[], excluded: DealerEligibilityReason[], unknown: DealerEligibilityReason[], configuredDetail?: string | null) {
  if (minimum == null) {
    passed.push(reason(code, label ?? code, configuredDetail ?? `${label} has no minimum configured.`));
    return;
  }
  if (value == null) unknown.push(reason(code, label ?? code, `${label} cannot be reliably parsed from the lead.`));
  else if (value < minimum) excluded.push(reason(code, label ?? code, `${value} is below required minimum ${minimum}.`));
  else passed.push(reason(code, label ?? code, `${value} satisfies required minimum ${minimum}.`));
}

function evaluateMaximum(code: string, label: string, value: number | null, maximum: number | null, passed: DealerEligibilityReason[], excluded: DealerEligibilityReason[], unknown: DealerEligibilityReason[]) {
  if (maximum == null) {
    passed.push(reason(code, label, `${label} has no maximum configured.`));
    return;
  }
  if (value == null) unknown.push(reason(code, label, `${label} cannot be reliably parsed from the lead.`));
  else if (value > maximum) excluded.push(reason(code, label, `${value.toLocaleString("en-GB")} exceeds configured maximum ${maximum.toLocaleString("en-GB")}.`));
  else passed.push(reason(code, label, `${value.toLocaleString("en-GB")} is within configured maximum ${maximum.toLocaleString("en-GB")}.`));
}

function evaluateAcceptance(code: string, label: string, confirmed: boolean | null, accepts: boolean, excludedDetail: string, passedDetail: string, passed: DealerEligibilityReason[], excluded: DealerEligibilityReason[], unknown: DealerEligibilityReason[]) {
  if (confirmed === true && !accepts) excluded.push(reason(code, label, excludedDetail));
  else if (confirmed === true) passed.push(reason(code, label, `${excludedDetail} Dealer accepts this.`));
  else if (confirmed === false) passed.push(reason(code, label, passedDetail));
  else unknown.push(reason(code, label, `${label} result is unavailable or ambiguous.`));
}

function normaliseLeadVehicleCheck(lead: DealerMatchingLead) {
  if (lead.vehicle_check_status !== "checked" && !lead.autotrader_vehicle_check_data && !lead.autotrader_vehicle_lookup_data) return null;
  const checkData = objectValue(lead.autotrader_vehicle_check_data);
  const lookupData = objectValue(lead.autotrader_vehicle_lookup_data);
  return normaliseVehicleCheck(firstObject(checkData.check, lookupData.check, checkData.history, lookupData.history, checkData.vehicleCheck, lookupData.vehicleCheck, checkData, lookupData));
}

function inferLeadCountry(lead: DealerMatchingLead): "england" | "wales" | "scotland" | "northern_ireland" | "republic_of_ireland" | null {
  const locationText = [lead.location_display_name, lead.location_town].filter(Boolean).join(" ").toLowerCase();
  if (/\brepublic of ireland\b|\bireland\b/.test(locationText) && !/\bnorthern ireland\b/.test(locationText)) return "republic_of_ireland";
  if (/\bnorthern ireland\b/.test(locationText)) return "northern_ireland";
  if (/\bscotland\b/.test(locationText)) return "scotland";
  if (/\bwales\b/.test(locationText)) return "wales";
  if (/\bengland\b/.test(locationText)) return "england";

  const postcode = normaliseUKPostcode(lead.normalised_postcode || lead.postcode);
  const area = postcode?.match(/^[A-Z]+/)?.[0] ?? "";
  if (!area || ambiguousPostcodeAreas.has(area)) return null;
  return definiteCountriesByPostcodeArea[area] ?? "england";
}

function distanceBetweenDealerAndLead(dealer: DealerMatchAccount, lead: DealerMatchingLead) {
  const dealerCoords = coordinates(dealer.latitude, dealer.longitude);
  const leadCoords = coordinates(lead.latitude, lead.longitude);
  if (!dealerCoords || !leadCoords) return null;
  return haversineMiles(dealerCoords, leadCoords);
}

function haversineMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radiusMiles = 3958.7613;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(radiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}

function coordinates(latitude: unknown, longitude: unknown) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  if (typeof latitude === "string" && !latitude.trim()) return null;
  if (typeof longitude === "string" && !longitude.trim()) return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null;
}

function parseWholeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const match = value.replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function normaliseToken(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
  return text || null;
}

function normaliseUKPostcode(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = cleaned.match(fullPostcodePattern);
  return match ? `${match[1]} ${match[2]}` : cleaned || null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstObject(...values: unknown[]) {
  for (const value of values) {
    const record = objectValue(value);
    if (Object.keys(record).length > 0) return record;
  }
  return {};
}

function reason(code: string, label: string, detail: string): DealerEligibilityReason {
  return { code, label, detail };
}

function countryLabel(country: string) {
  return country.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
