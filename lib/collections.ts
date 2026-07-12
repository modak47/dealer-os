import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cleanLocationText, lookupLeadLocation, normaliseUKPostcode, stockLocationUpdate } from "@/lib/location";
import { googleMapsDirectionsUrl, googleMapsLocationUrl } from "@/lib/location";
import { confirmPurchasePendingArrival } from "@/lib/purchase-pending";

export const collectionTypes = ["customer_collection", "customer_dropoff", "transporter_collection", "dealer_collection", "other"] as const;
export const collectionStatuses = ["not_scheduled", "scheduled", "confirmed", "en_route", "arrived", "collected", "received", "cancelled", "failed", "reschedule_required"] as const;
export const paymentStatuses = ["not_required", "pending", "part_paid", "paid", "failed", "on_hold", "finance_settlement_required"] as const;
export const paymentMethods = ["no_payment_due", "bank_transfer", "cash", "finance_settlement", "part_payment", "other"] as const;

export type CollectionStatus = typeof collectionStatuses[number];
export type CollectionRow = Record<string, unknown> & {
  id: string;
  stock_bike_id: number;
  website_lead_id: number | null;
  collection_type: string;
  collection_status: CollectionStatus;
  scheduled_date: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  time_window_text: string | null;
  assigned_user_id: string | null;
  assigned_driver_name: string | null;
  collection_address: string | null;
  collection_postcode: string | null;
  approximate_distance_miles: number | null;
  estimated_drive_minutes: number | null;
  estimated_collection_cost: number;
  actual_collection_cost: number;
  payment_status: string;
  balance_due: number;
  balance_paid: number;
  customer_confirmed: boolean;
  stock?: CollectionStock | null;
  assigned_user?: { id: string; full_name: string | null; role: string | null; phone: string | null } | null;
};

export type CollectionStock = {
  id: number;
  stock_number: string | null;
  registration: string | null;
  make: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  status: string;
  website_lead_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  customer_postcode?: string | null;
  collection_address?: string | null;
  collection_postcode?: string | null;
  collection_latitude?: number | null;
  collection_longitude?: number | null;
  collection_location_display_name?: string | null;
  distance_from_yesmoto_miles?: number | null;
  estimated_drive_minutes?: number | null;
  collection_notes?: string | null;
  purchase_price?: number | null;
  deposit_paid?: number | null;
  balance_outstanding?: number | null;
  expected_arrival_date?: string | null;
  mileage?: number | null;
};

const transitions: Record<CollectionStatus, CollectionStatus[]> = {
  not_scheduled: ["scheduled", "cancelled"],
  scheduled: ["confirmed", "reschedule_required", "cancelled"],
  confirmed: ["en_route", "reschedule_required", "cancelled"],
  en_route: ["arrived", "failed", "reschedule_required"],
  arrived: ["collected", "failed", "reschedule_required"],
  collected: ["received", "failed"],
  received: [],
  cancelled: ["reschedule_required"],
  failed: ["reschedule_required"],
  reschedule_required: ["scheduled", "cancelled"],
};

export function canTransition(from: string, to: string) {
  return transitions[from as CollectionStatus]?.includes(to as CollectionStatus) ?? false;
}

export async function getCollections(view = "upcoming", stockId?: string | null, assigned = "all") {
  const db = getSupabaseAdmin();
  const parsedStockId = optionalStockId(stockId);
  const [{ data, error }, { data: pending, error: pendingError }, { data: staff }] = await Promise.all([
    buildCollectionQuery(view, parsedStockId, assigned),
    db.from("stock_bikes").select(pendingSelect).eq("status", "Purchase Pending").order("created_at", { ascending: false }),
    db.from("dealer_users").select("id,full_name,role,phone,active").eq("active", true).order("full_name"),
  ]);
  if (error) {
    if (["42P01", "42703"].includes(error.code ?? "")) return emptyCollections(false);
    throw error;
  }
  if (pendingError) throw pendingError;

  const collections = (data ?? []) as CollectionRow[];
  const activeStockIds = new Set(collections.filter(item => !terminal(item.collection_status)).map(item => item.stock_bike_id));
  const unscheduled = ((pending ?? []) as CollectionStock[]).filter(bike => !activeStockIds.has(Number(bike.id)));
  return {
    migrationReady: true,
    collections,
    unscheduled,
    staff: staff ?? [],
    kpis: buildKpis(collections, unscheduled),
  };
}

export async function createCollection(body: Record<string, unknown>, userId: string | null) {
  const db = getSupabaseAdmin();
  const stockId = requiredStockId(body.stock_bike_id);
  if (!stockId) throw new Error("Stock record is required.");
  const { data: stock, error: stockError } = await db.from("stock_bikes").select(pendingSelect).eq("id", stockId).maybeSingle();
  if (stockError) throw stockError;
  if (!stock) throw new Error("Stock record not found.");
  if (stock.status !== "Purchase Pending") throw new Error("Only Purchase Pending bikes can be scheduled for collection.");

  const collectionType = enumValue(body.collection_type, collectionTypes, "customer_collection");
  const status = hasSchedule(body) ? "scheduled" : "not_scheduled";
  const location = await resolveCollectionLocation(body, stock as CollectionStock);
  const costs = collectionCosts(body);
  const payload = {
    stock_bike_id: stockId,
    website_lead_id: stock.website_lead_id ?? null,
    collection_type: collectionType,
    collection_status: status,
    ...scheduleFields(body),
    assigned_user_id: uuidOrNull(body.assigned_user_id),
    external_transporter_name: text(body.external_transporter_name, 160),
    external_transporter_reference: text(body.external_transporter_reference, 120),
    assigned_driver_name: text(body.assigned_driver_name, 160),
    assigned_driver_phone: text(body.assigned_driver_phone, 60),
    ...location.collection,
    ...costs,
    payment_method: enumValue(body.payment_method, paymentMethods, "no_payment_due"),
    payment_status: enumValue(body.payment_status, paymentStatuses, Number(body.balance_due ?? stock.balance_outstanding ?? 0) > 0 ? "pending" : "not_required"),
    deposit_paid: nonNegative(body.deposit_paid ?? stock.deposit_paid, "Deposit paid"),
    balance_due: nonNegative(body.balance_due ?? stock.balance_outstanding, "Balance due"),
    balance_paid: nonNegative(body.balance_paid, "Balance paid"),
    final_purchase_price: optionalNonNegative(body.final_purchase_price ?? stock.purchase_price, "Final purchase price"),
    final_purchase_price_note: text(body.final_purchase_price_note, 1000),
    customer_instructions: text(body.customer_instructions, 2000),
    parking_access_notes: text(body.parking_access_notes, 2000),
    collection_notes: text(body.collection_notes ?? stock.collection_notes, 3000),
    driver_notes: text(body.driver_notes, 3000),
    keys_expected: optionalInteger(body.keys_expected, "Keys expected"),
    photos_required: asBoolean(body.photos_required),
    created_by: userId,
    updated_by: userId,
  };
  const { data, error } = await db.from("stock_collections").insert(payload).select(selectCollection).single();
  if (error) throw error;
  await syncStockLocation(db, stockId, location.stock);
  await writeEvent(data.id, stockId, "collection_scheduled", status === "scheduled" ? "Collection scheduled" : "Collection created", null, status, {}, userId);
  return { collection: data, warnings: await conflictWarnings(data as CollectionRow) };
}

export async function updateCollection(id: string, body: Record<string, unknown>, userId: string | null) {
  const db = getSupabaseAdmin();
  const { data: current, error: currentError } = await db.from("stock_collections").select(selectCollection).eq("id", id).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("Collection not found.");
  const action = text(body.action, 60);

  if (action === "transition") {
    const next = enumValue(body.status, collectionStatuses, current.collection_status as CollectionStatus);
    if (!canTransition(String(current.collection_status), next)) throw new Error(`Cannot move collection from ${current.collection_status} to ${next}.`);
    return transitionCollection(current as CollectionRow, next, body, userId);
  }

  if (action === "prepare_confirmation") {
    return prepareConfirmation(current as CollectionRow, body, userId);
  }

  const location = await resolveCollectionLocation(body, current.stock as CollectionStock | null);
  const costs = collectionCosts(body);
  const update = {
    collection_type: enumValue(body.collection_type, collectionTypes, current.collection_type as typeof collectionTypes[number]),
    ...scheduleFields(body),
    assigned_user_id: uuidOrNull(body.assigned_user_id),
    external_transporter_name: text(body.external_transporter_name, 160),
    external_transporter_reference: text(body.external_transporter_reference, 120),
    assigned_driver_name: text(body.assigned_driver_name, 160),
    assigned_driver_phone: text(body.assigned_driver_phone, 60),
    ...location.collection,
    ...costs,
    payment_method: enumValue(body.payment_method, paymentMethods, current.payment_method as typeof paymentMethods[number]),
    payment_status: enumValue(body.payment_status, paymentStatuses, current.payment_status as typeof paymentStatuses[number]),
    deposit_paid: nonNegative(body.deposit_paid, "Deposit paid"),
    balance_due: nonNegative(body.balance_due, "Balance due"),
    balance_paid: nonNegative(body.balance_paid, "Balance paid"),
    final_purchase_price: optionalNonNegative(body.final_purchase_price, "Final purchase price"),
    final_purchase_price_note: text(body.final_purchase_price_note, 1000),
    customer_instructions: text(body.customer_instructions, 2000),
    parking_access_notes: text(body.parking_access_notes, 2000),
    collection_notes: text(body.collection_notes, 3000),
    driver_notes: text(body.driver_notes, 3000),
    keys_expected: optionalInteger(body.keys_expected, "Keys expected"),
    photos_required: asBoolean(body.photos_required),
    updated_by: userId,
  };
  const { data, error } = await db.from("stock_collections").update(update).eq("id", id).select(selectCollection).single();
  if (error) throw error;
  await syncStockLocation(db, current.stock_bike_id, location.stock);
  await applyStockFinanceFromCollection(db, data as CollectionRow);
  await writeEvent(id, current.stock_bike_id, "collection_edited", "Collection edited", String(current.collection_status), String(data.collection_status), {}, userId);
  return { collection: data, warnings: await conflictWarnings(data as CollectionRow) };
}

export async function getCollectionIcs(id: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("stock_collections").select(selectCollection).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Collection not found.");
  const c = data as CollectionRow;
  const start = dateStamp(c.scheduled_date, c.scheduled_start_time);
  const end = dateStamp(c.scheduled_date, c.scheduled_end_time) || start;
  const bike = bikeName(c.stock as CollectionStock | null);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//YesMoto//Collection Planner//EN", "BEGIN:VEVENT",
    `UID:${c.id}@yesmoto.co.uk`,
    `DTSTAMP:${icsDate(new Date())}`,
    start ? `DTSTART:${start}` : "",
    end ? `DTEND:${end}` : "",
    `SUMMARY:${escapeIcs(`Collect ${bike}`)}`,
    `LOCATION:${escapeIcs([c.collection_address, c.collection_postcode].filter(Boolean).join(", "))}`,
    `DESCRIPTION:${escapeIcs(`Customer: ${(c.stock as CollectionStock | null)?.customer_name ?? ""}\\nPhone: ${(c.stock as CollectionStock | null)?.customer_phone ?? ""}\\nPayment due: ${money(c.balance_due)}\\nDirections: ${directionsFor(c)}`)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return { filename: `yesmoto-collection-${c.id}.ics`, content: lines.join("\r\n") };
}

async function transitionCollection(current: CollectionRow, next: CollectionStatus, body: Record<string, unknown>, userId: string | null) {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { collection_status: next, updated_by: userId };
  if (next === "confirmed") {
    update.customer_confirmed = true;
    update.confirmation_method = text(body.confirmation_method, 80) || "manual";
    update.confirmation_received_at = now;
  }
  if (next === "collected") {
    if (current.payment_status !== "paid" && Number(current.balance_due ?? 0) > Number(current.balance_paid ?? 0) && !asBoolean(body.financial_override)) {
      throw new Error("Payment is not complete. Record payment, set no payment due, or use an authorised override.");
    }
    if (Number(body.final_purchase_price ?? current.final_purchase_price ?? 0) !== Number((current.stock as CollectionStock | null)?.purchase_price ?? 0) && !text(body.final_purchase_price_note ?? current.final_purchase_price_note, 1000)) {
      throw new Error("A note is required when the final purchase price changes.");
    }
    Object.assign(update, conditionFields(body), {
      collected_at: now,
      actual_collection_cost: nonNegative(body.actual_collection_cost ?? current.actual_collection_cost, "Actual collection cost"),
      final_purchase_price: optionalNonNegative(body.final_purchase_price ?? current.final_purchase_price, "Final purchase price"),
      final_purchase_price_note: text(body.final_purchase_price_note ?? current.final_purchase_price_note, 1000),
      balance_paid: nonNegative(body.balance_paid ?? current.balance_paid, "Balance paid"),
      payment_status: enumValue(body.payment_status ?? current.payment_status, paymentStatuses, current.payment_status as typeof paymentStatuses[number]),
      financial_override: asBoolean(body.financial_override),
    });
  }
  if (next === "received") {
    update.received_at = now;
  }
  if (next === "cancelled") {
    update.cancelled_at = now;
    update.cancellation_reason = text(body.cancellation_reason, 1000);
    if (!update.cancellation_reason) throw new Error("Cancellation reason is required.");
  }
  if (next === "failed") {
    update.failure_reason = text(body.failure_reason, 1000);
    if (!update.failure_reason) throw new Error("Failure reason is required.");
  }
  if (next === "scheduled") Object.assign(update, scheduleFields(body));

  const { data, error } = await db.from("stock_collections").update(update).eq("id", current.id).select(selectCollection).single();
  if (error) throw error;
  await applyStockFinanceFromCollection(db, data as CollectionRow);
  if (next === "received") {
    await confirmPurchasePendingArrival(db, current.stock_bike_id, {
      actual_purchase_price: data.final_purchase_price ?? (current.stock as CollectionStock | null)?.purchase_price ?? 0,
      actual_mileage: data.actual_mileage ?? (current.stock as CollectionStock | null)?.mileage,
      keys_received: data.keys_received,
      actual_transport_cost: data.actual_collection_cost,
      payment_status: data.payment_status === "paid" || data.payment_status === "not_required" ? "Paid" : "Part Paid",
      condition_notes: [data.condition_notes, data.customer_agreed_discrepancies].filter(Boolean).join("\n"),
      actual_arrival_date: now.slice(0, 10),
    }, userId);
  }
  await writeEvent(current.id, current.stock_bike_id, eventTypeFor(next), eventMessageFor(next), String(current.collection_status), next, {}, userId);
  return { collection: data, warnings: await conflictWarnings(data as CollectionRow) };
}

async function prepareConfirmation(current: CollectionRow, body: Record<string, unknown>, userId: string | null) {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const message = text(body.confirmation_message, 4000) || defaultConfirmationMessage(current);
  const method = text(body.confirmation_method, 80) || "manual";
  const update = {
    confirmation_method: method,
    confirmation_message: message,
    confirmation_prepared_at: now,
    confirmation_opened_at: asBoolean(body.opened_externally) ? now : current.confirmation_opened_at,
    updated_by: userId,
  };
  const { data, error } = await db.from("stock_collections").update(update).eq("id", current.id).select(selectCollection).single();
  if (error) throw error;
  await writeEvent(current.id, current.stock_bike_id, "confirmation_prepared", `Customer confirmation prepared by ${method}`, String(current.collection_status), String(current.collection_status), { method }, userId);
  return { collection: data, warnings: [] };
}

async function buildCollectionQuery(view: string, stockId?: number | null, assigned = "all") {
  const db = getSupabaseAdmin();
  let query = db.from("stock_collections").select(selectCollection).order("scheduled_date", { ascending: true }).order("scheduled_start_time", { ascending: true });
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  const week = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  if (stockId) query = query.eq("stock_bike_id", stockId);
  if (assigned !== "all") query = assigned === "unassigned" ? query.is("assigned_user_id", null) : query.eq("assigned_user_id", assigned);
  if (view === "today") query = query.eq("scheduled_date", ymd);
  if (view === "tomorrow") query = query.eq("scheduled_date", tomorrow);
  if (view === "week") query = query.gte("scheduled_date", ymd).lte("scheduled_date", week);
  if (view === "unscheduled") query = query.eq("collection_status", "not_scheduled");
  if (view === "upcoming") query = query.not("collection_status", "in", "(received,cancelled,failed)").gte("scheduled_date", ymd);
  if (view === "completed") query = query.eq("collection_status", "received");
  if (view === "cancelled") query = query.in("collection_status", ["cancelled", "failed"]);
  return query;
}

async function resolveCollectionLocation(body: Record<string, unknown>, stock?: CollectionStock | null) {
  const address = text(body.collection_address ?? stock?.collection_address ?? stock?.customer_address, 1000);
  const postcode = normaliseUKPostcode(text(body.collection_postcode ?? stock?.collection_postcode ?? stock?.customer_postcode, 40));
  const result = await lookupLeadLocation({ address, postcode });
  return {
    collection: {
      collection_address: address,
      collection_postcode: result.normalisedPostcode || postcode,
      latitude: result.latitude,
      longitude: result.longitude,
      approximate_distance_miles: result.distanceFromYesMotoMiles,
      estimated_drive_minutes: result.estimatedDriveMinutes,
    },
    stock: stockLocationUpdate(result, address, text(body.collection_notes ?? stock?.collection_notes, 2000)),
  };
}

async function syncStockLocation(db: ReturnType<typeof getSupabaseAdmin>, stockId: number, update: Record<string, unknown>) {
  await db.from("stock_bikes").update(update).eq("id", stockId);
}

async function applyStockFinanceFromCollection(db: ReturnType<typeof getSupabaseAdmin>, collection: CollectionRow) {
  const updates: Record<string, unknown> = {};
  if (collection.final_purchase_price != null) updates.purchase_price = collection.final_purchase_price;
  if (collection.actual_collection_cost != null) updates.actual_transport_cost = collection.actual_collection_cost;
  if (collection.estimated_collection_cost != null) updates.estimated_transport_cost = collection.estimated_collection_cost;
  if (collection.payment_status) updates.payment_status = collection.payment_status === "paid" || collection.payment_status === "not_required" ? "Paid" : "Part Paid";
  if (collection.actual_mileage != null) updates.mileage = collection.actual_mileage;
  if (collection.keys_received != null) updates.keys_received = collection.keys_received;
  if (collection.condition_notes) updates.condition_notes = collection.condition_notes;
  if (Object.keys(updates).length) await db.from("stock_bikes").update(updates).eq("id", collection.stock_bike_id);
}

export async function conflictWarnings(collection: CollectionRow) {
  if (!collection.scheduled_date || !collection.scheduled_start_time || !collection.scheduled_end_time) return [];
  const db = getSupabaseAdmin();
  let query = db.from("stock_collections").select("id,scheduled_start_time,scheduled_end_time,collection_address,collection_postcode,assigned_driver_name,stock:stock_bikes(stock_number,make,model)")
    .eq("scheduled_date", collection.scheduled_date)
    .neq("id", collection.id)
    .not("collection_status", "in", "(received,cancelled,failed)");
  if (collection.assigned_user_id) query = query.eq("assigned_user_id", collection.assigned_user_id);
  else if (collection.assigned_driver_name) query = query.eq("assigned_driver_name", collection.assigned_driver_name);
  else return [];
  const { data } = await query;
  const start = minutes(collection.scheduled_start_time);
  const end = minutes(collection.scheduled_end_time);
  return (data ?? []).filter(other => start < minutes(other.scheduled_end_time) && end > minutes(other.scheduled_start_time)).map(other => `${collection.assigned_driver_name || "Assigned staff"} already has a collection ${other.collection_postcode ? `near ${other.collection_postcode}` : ""} scheduled until ${String(other.scheduled_end_time).slice(0, 5)}.`);
}

async function writeEvent(collectionId: string, stockId: number, type: string, message: string, previousStatus: string | null, newStatus: string | null, metadata: Record<string, unknown>, userId: string | null) {
  await getSupabaseAdmin().from("stock_collection_events").insert({ collection_id: collectionId, stock_bike_id: stockId, event_type: type, message, previous_status: previousStatus, new_status: newStatus, metadata, created_by: userId });
}

function buildKpis(collections: CollectionRow[], unscheduled: CollectionStock[]) {
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  return {
    collectionsToday: collections.filter(c => c.scheduled_date === today).length,
    collectionsThisWeek: collections.filter(c => c.scheduled_date && c.scheduled_date >= today && c.scheduled_date <= weekEnd).length,
    unscheduledPurchases: unscheduled.length,
    awaitingConfirmation: collections.filter(c => ["scheduled", "reschedule_required"].includes(c.collection_status) && !c.customer_confirmed).length,
    driversEnRoute: collections.filter(c => c.collection_status === "en_route").length,
    bikesCollectedToday: collections.filter(c => String(c.collected_at ?? "").startsWith(today)).length,
    failedCollections: collections.filter(c => c.collection_status === "failed").length,
    estimatedCollectionCostThisMonth: sum(collections.filter(c => String(c.scheduled_date ?? "").startsWith(month)), "estimated_collection_cost"),
    actualCollectionCostThisMonth: sum(collections.filter(c => String(c.received_at ?? c.collected_at ?? "").startsWith(month)), "actual_collection_cost"),
  };
}

function scheduleFields(body: Record<string, unknown>) {
  const scheduledDate = dateOnly(body.scheduled_date);
  return {
    scheduled_date: scheduledDate,
    scheduled_start_time: timeOnly(body.scheduled_start_time),
    scheduled_end_time: timeOnly(body.scheduled_end_time),
    time_window_text: text(body.time_window_text, 120),
  };
}

function collectionCosts(body: Record<string, unknown>) {
  const estimated = nonNegative(body.estimated_collection_cost, "Estimated collection cost") || nonNegative(body.estimated_fuel_cost, "Estimated fuel") + nonNegative(body.transporter_quote, "Transporter quote") + nonNegative(body.tolls_cost, "Tolls") + nonNegative(body.parking_cost, "Parking") + nonNegative(body.train_fare_cost, "Train fare") + nonNegative(body.other_transport_cost, "Other transport");
  const actual = nonNegative(body.actual_collection_cost, "Actual collection cost") || nonNegative(body.actual_fuel_cost, "Actual fuel") + nonNegative(body.transporter_invoice, "Transporter invoice") + nonNegative(body.tolls_cost, "Tolls") + nonNegative(body.parking_cost, "Parking") + nonNegative(body.train_fare_cost, "Train fare") + nonNegative(body.other_transport_cost, "Other transport");
  return {
    estimated_fuel_cost: nonNegative(body.estimated_fuel_cost, "Estimated fuel"),
    actual_fuel_cost: nonNegative(body.actual_fuel_cost, "Actual fuel"),
    transporter_quote: nonNegative(body.transporter_quote, "Transporter quote"),
    transporter_invoice: nonNegative(body.transporter_invoice, "Transporter invoice"),
    tolls_cost: nonNegative(body.tolls_cost, "Tolls"),
    parking_cost: nonNegative(body.parking_cost, "Parking"),
    train_fare_cost: nonNegative(body.train_fare_cost, "Train fare"),
    other_transport_cost: nonNegative(body.other_transport_cost, "Other transport"),
    estimated_collection_cost: estimated,
    actual_collection_cost: actual,
  };
}

function conditionFields(body: Record<string, unknown>) {
  return {
    actual_mileage: optionalInteger(body.actual_mileage, "Actual mileage"),
    keys_received: optionalInteger(body.keys_received, "Keys received"),
    documents_received: jsonObject(body.documents_received),
    custom_checklist: jsonArray(body.custom_checklist),
    bike_starts: optionalBoolean(body.bike_starts),
    warning_lights: optionalBoolean(body.warning_lights),
    visible_damage: text(body.visible_damage, 1000),
    tyre_condition: text(body.tyre_condition, 500),
    chain_condition: text(body.chain_condition, 500),
    missing_parts: text(body.missing_parts, 1000),
    modifications: text(body.modifications, 1000),
    accessories: text(body.accessories, 1000),
    condition_notes: text(body.condition_notes, 3000),
    customer_agreed_discrepancies: text(body.customer_agreed_discrepancies, 2000),
  };
}

export function defaultConfirmationMessage(collection: CollectionRow) {
  const stock = collection.stock as CollectionStock | null;
  return `Hi ${stock?.customer_name || ""},\n\nThis is YesMoto confirming the collection of your ${bikeName(stock)}.\n\nDate: ${collection.scheduled_date || "To be confirmed"}\nTime: ${collection.time_window_text || [collection.scheduled_start_time, collection.scheduled_end_time].filter(Boolean).map(v => String(v).slice(0, 5)).join("-") || "To be confirmed"}\nCollection address: ${[collection.collection_address, collection.collection_postcode].filter(Boolean).join(", ")}\n\nPlease have the keys, V5C and any service history ready.\n\nPlease reply to confirm that this appointment is suitable.\n\nThanks,\nYesMoto`;
}

export function confirmationLinks(collection: CollectionRow) {
  const stock = collection.stock as CollectionStock | null;
  const message = encodeURIComponent(String(collection.confirmation_message || defaultConfirmationMessage(collection)));
  return {
    mailto: stock?.customer_email ? `mailto:${stock.customer_email}?subject=${encodeURIComponent("YesMoto motorcycle collection confirmation")}&body=${message}` : null,
    sms: stock?.customer_phone ? `sms:${stock.customer_phone}?&body=${message}` : null,
    whatsapp: stock?.customer_phone ? `https://wa.me/${stock.customer_phone.replace(/\D/g, "")}?text=${message}` : null,
  };
}

export function directionsFor(collection: CollectionRow) {
  return googleMapsDirectionsUrl("YesMoto", { address: collection.collection_address, postcode: collection.collection_postcode, latitude: (collection.latitude as number | null) ?? undefined, longitude: (collection.longitude as number | null) ?? undefined });
}

export function locationFor(collection: CollectionRow) {
  return googleMapsLocationUrl({ address: collection.collection_address, postcode: collection.collection_postcode, latitude: (collection.latitude as number | null) ?? undefined, longitude: (collection.longitude as number | null) ?? undefined });
}

export function bikeName(stock?: CollectionStock | null) {
  return [stock?.year, stock?.make, stock?.model, stock?.variant].filter(Boolean).join(" ") || "Motorcycle";
}

function eventTypeFor(status: CollectionStatus) {
  return ({ scheduled: "collection_scheduled", confirmed: "customer_confirmed", en_route: "driver_en_route", arrived: "driver_arrived", collected: "bike_collected", received: "bike_received", cancelled: "collection_cancelled", failed: "collection_failed", reschedule_required: "collection_reschedule_required", not_scheduled: "collection_not_scheduled" } as Record<CollectionStatus, string>)[status];
}

function eventMessageFor(status: CollectionStatus) {
  return status.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function emptyCollections(migrationReady: boolean) {
  return { migrationReady, collections: [] as CollectionRow[], unscheduled: [] as CollectionStock[], staff: [], kpis: buildKpis([], []) };
}

function terminal(status: string) {
  return ["received", "cancelled", "failed"].includes(status);
}

function hasSchedule(body: Record<string, unknown>) {
  return Boolean(body.scheduled_date || body.time_window_text);
}

function text(value: unknown, max = 500) {
  return cleanLocationText(value, max) || null;
}

function optionalStockId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("Stock ID must be a valid number.");
  return parsed;
}

function requiredStockId(value: unknown) {
  const parsed = optionalStockId(value);
  if (!parsed) throw new Error("Stock record is required.");
  return parsed;
}

function nonNegative(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} cannot be negative.`);
  return parsed;
}

function optionalNonNegative(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  return nonNegative(value, label);
}

function optionalInteger(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a whole number.`);
  return parsed;
}

function asBoolean(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function optionalBoolean(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return asBoolean(value);
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]) {
  const raw = String(value ?? "").trim();
  return values.includes(raw) ? raw as T[number] : fallback;
}

function uuidOrNull(value: unknown) {
  const raw = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}

function dateOnly(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("Scheduled date must be valid.");
  return date.toISOString().slice(0, 10);
}

function timeOnly(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{2}:\d{2}/.test(raw)) throw new Error("Scheduled time must be valid.");
  return raw.slice(0, 5);
}

function minutes(value: unknown) {
  const [h, m] = String(value ?? "00:00").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function sum(rows: CollectionRow[], key: keyof CollectionRow) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

function jsonObject(value: unknown) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function jsonArray(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function dateStamp(date?: string | null, time?: string | null) {
  if (!date || !time) return "";
  return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
}

function icsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value ?? 0));
}

const pendingSelect = "id,stock_number,registration,make,model,variant,year,status,website_lead_id,customer_name,customer_phone,customer_email,customer_address,customer_postcode,collection_address,collection_postcode,collection_latitude,collection_longitude,collection_location_display_name,distance_from_yesmoto_miles,estimated_drive_minutes,collection_notes,purchase_price,deposit_paid,balance_outstanding,expected_arrival_date,mileage,created_at";
const selectCollection = "*,stock:stock_bikes(id,stock_number,registration,make,model,variant,year,status,website_lead_id,customer_name,customer_phone,customer_email,customer_address,customer_postcode,collection_address,collection_postcode,collection_latitude,collection_longitude,collection_location_display_name,distance_from_yesmoto_miles,estimated_drive_minutes,collection_notes,purchase_price,deposit_paid,balance_outstanding,expected_arrival_date,mileage),assigned_user:dealer_users(id,full_name,role,phone)";
