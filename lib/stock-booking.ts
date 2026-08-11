import "server-only";

import { getCurrentUserId } from "@/lib/current-user";
import { getSocialPublicOrigin } from "@/lib/social-automation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normaliseRegistration } from "@/lib/vrm-lookup";

export type StockBookingResult = {
  stock_bike_id: number;
  stock_number: string;
  purchase_id?: string;
  existing?: boolean;
};

const sellerTypes = new Set(["private_seller", "trade_supplier", "auction", "part_exchange", "existing_customer", "other"]);
const costCategories = new Set(["parts", "workshop_labour", "external_workshop", "mot", "transport", "collection", "delivery", "valeting", "photography", "advertising", "hpi", "auction_fee", "buyer_fee", "administration", "warranty", "other"]);
const socialPlatforms = ["facebook", "instagram", "pinterest", "google_business"] as const;

export async function bookMotorcycleIntoStock(input: Record<string, unknown>) {
  const payload = normaliseBookingPayload(input);
  const userId = await getCurrentUserId();
  const { data, error } = await getSupabaseAdmin().rpc("book_motorcycle_into_stock", { p_payload: payload, p_user_id: userId });
  if (error) throw new Error(error.message);
  const result = data as StockBookingResult;
  if (!result.existing) await saveAutotraderStockFields(result.stock_bike_id, payload);
  try {
    await queueSocialDrafts(result.stock_bike_id, payload, userId);
  } catch (error) {
    console.warn("Unable to queue stock booking social drafts", error);
  }
  return result;
}

function normaliseBookingPayload(input: Record<string, unknown>) {
  const idempotencyKey = text(input.idempotency_key, 120);
  if (!idempotencyKey) throw new Error("Booking reference is missing. Refresh and try again.");

  const registration = normaliseRegistration(text(input.registration, 20));
  const vin = text(input.vin, 30).toUpperCase();
  const make = text(input.make, 100);
  const model = text(input.model, 100);
  if (!registration && !vin) throw new Error("Registration or VIN is required.");
  if (vin && !/^[A-HJ-NPR-Z0-9]{11,17}$/i.test(vin)) throw new Error("VIN must be 11 to 17 valid characters.");
  if (!make || !model) throw new Error("Make and model are required.");

  const year = optionalInteger(input.year, "Year");
  const currentYear = new Date().getFullYear() + 1;
  if (year != null && (year < 1950 || year > currentYear)) throw new Error("Year must be plausible.");

  const mileage = optionalInteger(input.mileage, "Mileage");
  const purchasePrice = money(input.purchase_price, "Purchase price");
  const targetRetail = optionalMoney(input.target_retail_price, "Target retail price");
  if (purchasePrice <= 0) throw new Error("Purchase price is required.");

  const sellerType = text(input.seller_type, 40) || "private_seller";
  const collectionTransportCost = optionalMoney(input.collection_transport_cost, "Collection or transport cost");
  const auctionBuyerFees = optionalMoney(input.auction_buyer_fees, "Auction or buyer fees");
  const hpiCost = optionalMoney(input.hpi_cost, "HPI cost");
  const otherImmediateCosts = optionalMoney(input.other_immediate_costs, "Other immediate costs");

  return {
    idempotency_key: idempotencyKey,
    registration,
    vin: vin || null,
    engine_number: text(input.engine_number, 80).toUpperCase() || null,
    make,
    model,
    variant: text(input.variant, 160) || null,
    derivative_id: text(input.derivative_id, 120) || null,
    autotrader_vehicle_id: text(input.autotrader_vehicle_id, 120) || null,
    autotrader_taxonomy_data: object(input.autotrader_taxonomy_data),
    autotrader_mot_data: object(input.autotrader_mot_data),
    year,
    mileage,
    engine_cc: optionalInteger(input.engine_cc, "Engine capacity"),
    bhp: optionalMoney(input.bhp, "BHP"),
    torque: text(input.torque, 80) || null,
    co2: text(input.co2, 80) || null,
    road_tax: text(input.road_tax, 80) || null,
    top_speed: text(input.top_speed, 80) || null,
    number_of_gears: optionalInteger(input.number_of_gears, "Number of gears"),
    length_mm: optionalMoney(input.length_mm, "Length"),
    width_mm: optionalMoney(input.width_mm, "Width"),
    weight_kg: optionalMoney(input.weight_kg, "Weight"),
    euro_emissions: text(input.euro_emissions, 80) || null,
    colour: text(input.colour, 80) || null,
    fuel: text(input.fuel, 60) || null,
    transmission: text(input.transmission, 80) || null,
    body_style: text(input.body_style, 80) || null,
    previous_owners: optionalInteger(input.previous_owners, "Previous owners"),
    registration_date: dateOnly(input.registration_date, "Date of first registration"),
    first_registration_date: dateOnly(input.registration_date, "Date of first registration"),
    mot_expiry: dateOnly(input.mot_expiry, "MOT expiry"),
    service_history: text(input.service_history, 1000) || null,
    hpi_category: text(input.hpi_category, 60) || null,
    hpi_status: text(input.hpi_status, 80) || null,
    condition: text(input.condition, 1000) || null,
    notes: text(input.notes, 3000) || null,
    status: text(input.status, 80) || "Awaiting Preparation",
    purchase_source: text(input.purchase_source, 80) || sellerType,
    purchase_date: dateOnly(input.purchase_date, "Purchase date") || new Date().toISOString().slice(0, 10),
    purchase_price: purchasePrice,
    payment_method: text(input.payment_method, 80) || null,
    payment_status: text(input.payment_status, 40) || "unpaid",
    purchase_reference: text(input.purchase_reference, 120) || null,
    purchase_notes: text(input.purchase_notes, 2000) || null,
    target_retail_price: targetRetail,
    minimum_retail_price: optionalMoney(input.minimum_retail_price, "Minimum acceptable price"),
    expected_preparation_cost: optionalMoney(input.expected_preparation_cost, "Expected preparation cost"),
    collection_transport_cost: collectionTransportCost,
    auction_buyer_fees: auctionBuyerFees,
    other_immediate_costs: otherImmediateCosts,
    target_gross_profit: targetRetail != null ? targetRetail - purchasePrice - (optionalMoney(input.expected_preparation_cost, "Expected preparation cost") ?? 0) : null,
    pricing_notes: text(input.pricing_notes, 1000) || null,
    seller: {
      type: sellerTypes.has(sellerType) ? sellerType : "other",
      name: text(input.seller_name, 160) || "Unknown seller",
      company_name: text(input.seller_company_name, 160) || null,
      email: text(input.seller_email, 320) || null,
      phone: text(input.seller_phone, 60) || null,
      address_line_1: text(input.seller_address_line_1, 240) || null,
      address_line_2: text(input.seller_address_line_2, 240) || null,
      town: text(input.seller_town, 120) || null,
      county: text(input.seller_county, 120) || null,
      postcode: text(input.seller_postcode, 20).toUpperCase() || null,
      notes: text(input.seller_notes, 1000) || null,
    },
    workshop_required: bool(input.workshop_required),
    pdi_required: bool(input.pdi_required),
    service_required: bool(input.service_required),
    mot_required: bool(input.mot_required),
    diagnostic_required: bool(input.diagnostic_required),
    repair_required: bool(input.repair_required),
    valet_required: bool(input.valet_required),
    detail_required: bool(input.detail_required),
    cosmetic_required: bool(input.cosmetic_required),
    photos_required: input.photos_required === undefined ? true : bool(input.photos_required),
    video_required: bool(input.video_required),
    hpi_check_required: bool(input.hpi_check_required),
    documents_required: bool(input.documents_required),
    spare_key_required: bool(input.spare_key_required),
    transport_required: bool(input.transport_required),
    social_queue_required: input.social_queue_required === undefined ? true : bool(input.social_queue_required),
    social_platforms: socialPlatforms.filter(platform => input[`social_${platform}`] === undefined ? true : bool(input[`social_${platform}`])),
    website_lead_id: optionalInteger(input.website_lead_id, "Website lead ID"),
    source_opportunity_id: optionalInteger(input.source_opportunity_id, "Buying opportunity ID"),
    source_deal_id: text(input.source_deal_id, 40) || null,
    immediate_costs: [
      cost("collection", "Collection / transport", collectionTransportCost, input.payment_method),
      cost("buyer_fee", "Auction / buyer fees", auctionBuyerFees, input.payment_method),
      cost("hpi", "HPI / vehicle check", hpiCost, input.payment_method),
      cost("other", "Other immediate acquisition costs", otherImmediateCosts, input.payment_method),
    ].filter(Boolean),
  };
}

async function queueSocialDrafts(stockBikeId: number, payload: Record<string, unknown>, userId: string | null) {
  if (!payload.social_queue_required) return;
  const platforms = Array.isArray(payload.social_platforms) ? payload.social_platforms.filter((platform): platform is string => typeof platform === "string" && socialPlatforms.includes(platform as (typeof socialPlatforms)[number])) : [];
  if (!platforms.length) return;

  const db = getSupabaseAdmin();
  const [bikeResult, channelsResult, templatesResult, existingResult] = await Promise.all([
    db.from("stock_bikes").select("id,make,model,variant,year,mileage,price,target_retail_price,registration,image_urls,primary_image_url").eq("id", stockBikeId).single(),
    db.from("social_channels").select("id,platform").in("platform", platforms),
    db.from("social_post_templates").select("id,platform,caption_template,display_order").eq("active", true).eq("trigger_type", "new_stock").order("display_order"),
    db.from("social_post_queue").select("platform,status").eq("stock_bike_id", stockBikeId).in("platform", platforms).in("status", ["draft", "approved", "scheduled", "posting", "posted", "failed"]),
  ]);

  if (bikeResult.error) throw bikeResult.error;
  if (channelsResult.error) throw channelsResult.error;
  if (templatesResult.error) throw templatesResult.error;
  if (existingResult.error) throw existingResult.error;

  const queued = new Set((existingResult.data ?? []).map(row => String(row.platform)));
  const channels = new Map((channelsResult.data ?? []).map(row => [String(row.platform), String(row.id)]));
  const templates = (templatesResult.data ?? []) as { id: string; platform: string | null; caption_template: string; display_order: number }[];
  const stock = bikeResult.data as Record<string, unknown>;
  const origin = getSocialPublicOrigin();
  const imageUrl = text(stock.primary_image_url, 500) || (Array.isArray(stock.image_urls) ? text(stock.image_urls[0], 500) : "");

  const rows = platforms.filter(platform => !queued.has(platform)).map(platform => {
    const template = templates.find(row => row.platform === platform) ?? templates.find(row => row.platform === null) ?? null;
    return {
      stock_bike_id: stockBikeId,
      channel_id: channels.get(platform) ?? null,
      template_id: template?.id ?? null,
      platform,
      status: "draft",
      caption: renderBookingSocialCaption(template?.caption_template, stock, payload, origin),
      image_url: imageUrl || null,
      target_url: `${origin}/used-bikes/${stockSlug(stock, payload)}`,
      scheduled_for: null,
      created_by: userId,
      metadata: {
        source: "dealeros_stock_booking",
        queued_from: "book_into_stock",
        requires_review: true,
      },
    };
  });

  if (!rows.length) return;
  const { error } = await db.from("social_post_queue").insert(rows);
  if (error) throw error;
}

function renderBookingSocialCaption(template: string | undefined, stock: Record<string, unknown>, payload: Record<string, unknown>, origin: string) {
  const price = Number(stock.price ?? stock.target_retail_price ?? payload.target_retail_price ?? 0);
  const mileage = optionalIntegerValue(stock.mileage ?? payload.mileage);
  const values: Record<string, string> = {
    year: text(stock.year ?? payload.year, 20),
    make: text(stock.make ?? payload.make, 100),
    model: text(stock.model ?? payload.model, 100),
    variant: text(stock.variant ?? payload.variant, 160),
    price: price > 0 ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(price) : "Price TBC",
    mileage: mileage == null ? "Mileage TBC" : `${mileage.toLocaleString("en-GB")} miles`,
    url: `${origin}/used-bikes/${stockSlug(stock, payload)}`,
  };
  const fallback = "New in at YesMoto: {{year}} {{make}} {{model}} {{variant}}. {{price}}. Review photos and advert before approving this post: {{url}}";
  return (template || fallback).replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "").replace(/\s+/g, " ").trim();
}

function stockSlug(stock: Record<string, unknown>, payload: Record<string, unknown>) {
  const parts = [stock.make ?? payload.make, stock.model ?? payload.model, stock.registration ?? payload.registration ?? stock.id].map(part => text(part, 120)).filter(Boolean);
  return parts.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || String(stock.id || "stock");
}

async function saveAutotraderStockFields(stockBikeId: number, payload: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  if (payload.autotrader_vehicle_id) updates.autotrader_vehicle_id = payload.autotrader_vehicle_id;
  if (payload.autotrader_taxonomy_data && typeof payload.autotrader_taxonomy_data === "object") updates.autotrader_taxonomy_data = payload.autotrader_taxonomy_data;
  if (payload.autotrader_mot_data && typeof payload.autotrader_mot_data === "object") updates.autotrader_mot_data = payload.autotrader_mot_data;
  if (payload.body_style) updates.body_style = payload.body_style;
  if (payload.engine_number) updates.engine_number = payload.engine_number;
  const autotraderSpecifications = buildAutotraderSpecifications(payload);
  if (autotraderSpecifications) updates.specifications = { auto_trader: autotraderSpecifications };
  for (const field of ["bhp", "torque", "co2", "road_tax", "top_speed", "number_of_gears", "length_mm", "width_mm", "weight_kg", "euro_emissions"]) {
    if (payload[field] !== null && payload[field] !== undefined && payload[field] !== "") updates[field] = payload[field];
  }
  if (!Object.keys(updates).length) return;
  const { error } = await getSupabaseAdmin().from("stock_bikes").update(updates).eq("id", stockBikeId);
  if (error) throw new Error(error.message);
}

function cost(category: string, description: string, amount: number | null, method: unknown) {
  if (!amount || amount <= 0) return null;
  return { category: costCategories.has(category) ? category : "other", description, amount, payment_status: "unpaid", payment_method: text(method, 80) || null };
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : typeof value === "number" ? String(value) : "";
}

function optionalInteger(value: unknown, label: string) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a whole number.`);
  return parsed;
}

function optionalMoney(value: unknown, label: string) {
  if (value === "" || value === null || value === undefined) return null;
  return money(value, label);
}

function money(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or more.`);
  return Math.round(parsed * 100) / 100;
}

function dateOnly(value: unknown, label: string) {
  if (!value) return null;
  const raw = text(value, 30);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  throw new Error(`${label} must be a valid date.`);
}

function bool(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function optionalIntegerValue(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function buildAutotraderSpecifications(payload: Record<string, unknown>) {
  const taxonomy = object(payload.autotrader_taxonomy_data);
  const motData = object(payload.autotrader_mot_data);
  const vehicle = object(taxonomy.vehicle);
  if (!Object.keys(vehicle).length && !Object.keys(taxonomy).length && !Object.keys(motData).length) return null;
  return {
    captured_at: new Date().toISOString(),
    source: "auto_trader_connect",
    vehicle,
    vehicle_flat: flattenScalars(vehicle),
    full_response: taxonomy,
    mot_and_history: motData,
  };
}

function flattenScalars(value: unknown, prefix = "", output: Record<string, string | number | boolean | null> = {}) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (prefix) output[prefix] = value;
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenScalars(item, prefix ? `${prefix}.${index}` : String(index), output));
    return output;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flattenScalars(child, prefix ? `${prefix}.${key}` : key, output);
    }
  }
  return output;
}

function object(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}
