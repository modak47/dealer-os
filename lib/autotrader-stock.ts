import "server-only";

import { absoluteUrl } from "@/lib/site-url";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";

export type AutotraderAdvertisingStatus = "PUBLISHED" | "NOT_PUBLISHED";

export type AutotraderStockPayload = {
  advertiserId: string;
  metadata: {
    sourceStockId: string;
    sourceStockNumber: string | null;
    sourceUrl: string;
  };
  vehicle: Record<string, unknown>;
  advert: Record<string, unknown>;
  lifecycleState: "DUE_IN" | "FORECOURT" | "SALE_IN_PROGRESS" | "SOLD" | "DELETED" | "WASTEBIN";
  advertisingLocations: Record<"autotraderAdvert" | "advertiserAdvert" | "profileAdvert" | "locatorAdvert" | "exportAdvert", AutotraderAdvertisingStatus>;
};

export function buildAutotraderStockPayload(bike: SupabaseStockBike, advertiserId: string, publish = false): AutotraderStockPayload {
  const advertSections = objectRecord(bike.advert_sections);
  const taxonomy = objectRecord(bike.autotrader_taxonomy_data);
  const vehicleType = text(taxonomy.vehicleType) || "Bike";
  const description = [
    text(advertSections.intro_description) || text(bike.description),
    text(advertSections.key_details),
    text(advertSections.fitted_extras),
    text(advertSections.preparation_work),
    text(advertSections.included_before_delivery),
    text(advertSections.why_buy_from_yesmoto),
    text(advertSections.finance_options),
  ].filter(Boolean).join("\n\n");

  const publishStatus: AutotraderAdvertisingStatus = publish ? "PUBLISHED" : "NOT_PUBLISHED";

  return {
    advertiserId,
    metadata: {
      sourceStockId: String(bike.id),
      sourceStockNumber: bike.stock_number ?? null,
      sourceUrl: absoluteUrl(`/admin/stock/${bike.id}`),
    },
    vehicle: cleanObject({
      registration: normaliseRegistration(bike.registration),
      vin: text(bike.vin),
      derivativeId: text(bike.derivative_id) || text(bike.autotrader_vehicle_id),
      vehicleType,
      make: text(bike.make),
      model: text(bike.model),
      derivative: text(bike.variant),
      firstRegistrationDate: text(bike.registration_date),
      year: bike.year,
      odometerReadingMiles: bike.mileage,
      colour: text(bike.colour),
      fuelType: text(bike.fuel),
      transmissionType: text(bike.transmission),
      bodyType: text(bike.body_style),
      engineCapacityCC: bike.engine_cc,
      owners: bike.previous_owners,
      motExpiryDate: text(bike.mot_expiry),
    }),
    advert: cleanObject({
      stockId: bike.stock_number || String(bike.id),
      price: bike.price,
      attentionGrabber: text(advertSections.advert_headline) || text(bike.attention_grabber),
      description,
      images: (bike.image_urls ?? []).filter(Boolean).slice(0, 100).map((url, index) => ({ url, order: index + 1 })),
      features: Array.isArray(bike.features) ? bike.features.filter(Boolean) : [],
      websiteUrl: absoluteUrl(`/used-bikes/${publicSlug(bike)}`),
    }),
    lifecycleState: stockLifecycleState(bike.status),
    advertisingLocations: {
      autotraderAdvert: publishStatus,
      advertiserAdvert: publishStatus,
      profileAdvert: "NOT_PUBLISHED",
      locatorAdvert: "NOT_PUBLISHED",
      exportAdvert: "NOT_PUBLISHED",
    },
  };
}

export function validateAutotraderStockPayload(payload: AutotraderStockPayload) {
  const missing: string[] = [];
  if (!text(payload.vehicle.registration) && !text(payload.vehicle.vin)) missing.push("registration or VIN");
  if (!text(payload.vehicle.derivativeId)) missing.push("Auto Trader derivative ID");
  if (!Number(payload.vehicle.odometerReadingMiles)) missing.push("mileage");
  if (!Number(payload.advert.price)) missing.push("price");
  if (!text(payload.advert.description)) missing.push("advert description");
  return { ok: missing.length === 0, missing };
}

function stockLifecycleState(status: string): AutotraderStockPayload["lifecycleState"] {
  const normalised = status.trim().toLowerCase();
  if (normalised.includes("sold") || normalised.includes("sale completed")) return "SOLD";
  if (normalised.includes("purchase pending") || normalised.includes("prep")) return "DUE_IN";
  if (normalised.includes("reserved")) return "SALE_IN_PROGRESS";
  if (normalised.includes("cancelled")) return "WASTEBIN";
  return "FORECOURT";
}

function publicSlug(bike: SupabaseStockBike) {
  return [bike.make, bike.model, bike.registration || bike.id]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normaliseRegistration(value: string | null | undefined) {
  return text(value).toUpperCase().replace(/\s+/g, "");
}

function objectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanObject(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => {
    if (value === null || value === undefined || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }));
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
