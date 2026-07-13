"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type BookingResult = { stock_bike_id: number; stock_number: string; purchase_id?: string; existing?: boolean };

const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value || 0);

export function StockBookingForm() {
  const router = useRouter();
  const [lookupReg, setLookupReg] = useState("");
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BookingResult | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(() => ({
    idempotency_key: crypto.randomUUID(),
    status: "Awaiting Preparation",
    purchase_source: "private_seller",
    seller_type: "private_seller",
    payment_status: "unpaid",
    photos_required: true,
    workshop_required: true,
    pdi_required: true,
    valet_required: true,
    hpi_check_required: true,
    documents_required: true,
    purchase_date: new Date().toISOString().slice(0, 10),
  }));

  const purchase = numberValue(form.purchase_price);
  const prep = numberValue(form.expected_preparation_cost);
  const transport = numberValue(form.collection_transport_cost);
  const fees = numberValue(form.auction_buyer_fees) + numberValue(form.hpi_cost) + numberValue(form.other_immediate_costs);
  const retail = numberValue(form.target_retail_price);
  const totalCost = purchase + prep + transport + fees;
  const estimatedProfit = retail - totalCost;

  const canSubmit = useMemo(() => !submitting && !result, [submitting, result]);

  function update(key: string, value: string | boolean) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function lookupVehicle() {
    setLookupLoading(true);
    setLookupMessage("");
    setError("");
    try {
      const response = await fetch("/api/vrm-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vrm: lookupReg }) });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.error || "Lookup failed."));
      const vehicle = data.vehicle && typeof data.vehicle === "object" ? data.vehicle as Record<string, unknown> : data;
      update("registration", lookupReg.toUpperCase().replace(/\s+/g, ""));
      const make = pickVehicleText(vehicle, "make", "display_name", "map_id");
      const model = pickVehicleText(vehicle, "model", "genericModel");
      const year = String(vehicle.year ?? vehicle.manufactureYear ?? "");
      if (make) update("make", make);
      if (model) update("model", model);
      if (year) update("year", year);
      if (vehicle.colour) update("colour", String(vehicle.colour));
      if (vehicle.fuelType) update("fuel", String(vehicle.fuelType));
      if (vehicle.transmission) update("transmission", String(vehicle.transmission));
      if (vehicle.engineCapacity) update("engine_cc", String(vehicle.engineCapacity));
      setLookupMessage("Lookup completed. Check and correct the details before booking.");
    } catch (caught) {
      setLookupMessage(caught instanceof Error ? caught.message : "Lookup unavailable. Enter details manually.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget));
      payload.idempotency_key = String(form.idempotency_key);
      for (const key of checkboxKeys) payload[key] = String(Boolean(form[key]));
      const response = await fetch("/api/stock/book-into-stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { booking?: BookingResult; error?: string };
      if (!response.ok || !data.booking) throw new Error(data.error || "Unable to book motorcycle into stock.");
      setResult(data.booking);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to book motorcycle into stock.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return <section className="stock-booking-success">
      <span>Booked</span>
      <h2>{result.stock_number}</h2>
      <p>The motorcycle, purchase record, ledger entries and preparation workflow are connected.</p>
      <div>
        <Link className="admin-primary" href={`/admin/stock/${result.stock_bike_id}`}>Open stock record</Link>
        <Link href="/workflow">Open workflow</Link>
        <Link href="/admin/stock-ledger">Stock ledger</Link>
        <button type="button" onClick={() => { setResult(null); setForm(current => ({ ...current, idempotency_key: crypto.randomUUID() })); }}>Book another motorcycle</button>
      </div>
    </section>;
  }

  return <form className="stock-booking" onSubmit={submit}>
    <section>
      <header><span>1</span><div><h2>Vehicle Lookup</h2><p>Use VRM lookup where available, then confirm the details manually.</p></div></header>
      <div className="stock-booking-lookup">
        <input value={lookupReg} onChange={event => setLookupReg(event.target.value.toUpperCase())} placeholder="Registration" />
        <button type="button" onClick={() => void lookupVehicle()} disabled={lookupLoading || !lookupReg.trim()}>{lookupLoading ? "Looking up..." : "Lookup Vehicle"}</button>
      </div>
      {lookupMessage && <p className="stock-booking-message">{lookupMessage}</p>}
    </section>

    <section>
      <header><span>2</span><div><h2>Vehicle Details</h2><p>Registration or VIN, make and model are required.</p></div></header>
      <div className="stock-booking-grid">
        <Field name="registration" label="Registration" form={form} update={update} />
        <Field name="vin" label="VIN" form={form} update={update} />
        <Field name="make" label="Make" form={form} update={update} required />
        <Field name="model" label="Model" form={form} update={update} required />
        <Field name="variant" label="Derivative / variant" form={form} update={update} />
        <Field name="derivative_id" label="Derivative ID" form={form} update={update} />
        <Field name="year" label="Year" form={form} update={update} type="number" />
        <Field name="mileage" label="Mileage" form={form} update={update} type="number" />
        <Field name="engine_cc" label="Engine capacity" form={form} update={update} type="number" />
        <Field name="colour" label="Colour" form={form} update={update} />
        <Field name="fuel" label="Fuel type" form={form} update={update} />
        <Field name="transmission" label="Transmission" form={form} update={update} />
        <Field name="previous_owners" label="Previous owners" form={form} update={update} type="number" />
        <Field name="registration_date" label="Date first registered" form={form} update={update} type="date" />
        <Field name="mot_expiry" label="MOT expiry" form={form} update={update} type="date" />
        <Field name="service_history" label="Service history" form={form} update={update} />
        <Field name="hpi_category" label="HPI category marker" form={form} update={update} />
        <Field name="hpi_status" label="HPI status" form={form} update={update} />
        <label className="full"><span>Condition notes</span><textarea name="condition" value={String(form.condition ?? "")} onChange={event => update("condition", event.target.value)} /></label>
      </div>
    </section>

    <section>
      <header><span>3</span><div><h2>Purchase Details</h2><p>Seller, purchase price and immediate acquisition costs.</p></div></header>
      <div className="stock-booking-grid">
        <Select name="purchase_source" label="Purchase source" form={form} update={update} options={["private_seller", "trade_supplier", "auction", "part_exchange", "existing_customer", "buying_opportunity", "website_lead", "other"]} />
        <Select name="seller_type" label="Seller type" form={form} update={update} options={["private_seller", "trade_supplier", "auction", "part_exchange", "existing_customer", "other"]} />
        <Field name="seller_name" label="Seller name" form={form} update={update} required />
        <Field name="seller_company_name" label="Company name" form={form} update={update} />
        <Field name="seller_phone" label="Seller phone" form={form} update={update} />
        <Field name="seller_email" label="Seller email" form={form} update={update} type="email" />
        <Field name="seller_postcode" label="Seller postcode" form={form} update={update} />
        <Field name="purchase_date" label="Purchase date" form={form} update={update} type="date" required />
        <Field name="purchase_price" label="Purchase price" form={form} update={update} type="number" required />
        <Select name="payment_status" label="Payment status" form={form} update={update} options={["unpaid", "pending", "part_paid", "paid"]} />
        <Field name="payment_method" label="Payment method" form={form} update={update} />
        <Field name="purchase_reference" label="Reference" form={form} update={update} />
        <Field name="collection_transport_cost" label="Collection / transport cost" form={form} update={update} type="number" />
        <Field name="auction_buyer_fees" label="Auction / buyer fees" form={form} update={update} type="number" />
        <Field name="hpi_cost" label="HPI cost" form={form} update={update} type="number" />
        <Field name="other_immediate_costs" label="Other immediate costs" form={form} update={update} type="number" />
        <label className="full"><span>Purchase notes</span><textarea name="purchase_notes" value={String(form.purchase_notes ?? "")} onChange={event => update("purchase_notes", event.target.value)} /></label>
      </div>
    </section>

    <section>
      <header><span>4</span><div><h2>Pricing</h2><p>Live estimate for convenience. Server recalculates before saving.</p></div></header>
      <div className="stock-booking-grid">
        <Field name="expected_preparation_cost" label="Expected preparation cost" form={form} update={update} type="number" />
        <Field name="target_retail_price" label="Target retail price" form={form} update={update} type="number" />
        <Field name="minimum_retail_price" label="Minimum acceptable price" form={form} update={update} type="number" />
        <label className="full"><span>Pricing notes</span><textarea name="pricing_notes" value={String(form.pricing_notes ?? "")} onChange={event => update("pricing_notes", event.target.value)} /></label>
      </div>
      <div className="stock-booking-kpis"><div><span>Total estimated cost</span><b>{money(totalCost)}</b></div><div><span>Target retail</span><b>{money(retail)}</b></div><div><span>Estimated gross profit</span><b className={estimatedProfit < 0 ? "danger" : ""}>{money(estimatedProfit)}</b></div></div>
    </section>

    <section>
      <header><span>5</span><div><h2>Preparation Requirements</h2><p>Initialises the existing workshop, valeting and photo workflows.</p></div></header>
      <div className="stock-booking-checks">{checkboxKeys.map(key => <label key={key}><input type="checkbox" checked={Boolean(form[key])} onChange={event => update(key, event.target.checked)} /><span>{labelFor(key)}</span></label>)}</div>
    </section>

    {error && <p className="stock-booking-error">{error}</p>}
    <footer><Link href="/admin/stock">Cancel</Link><button className="admin-primary" disabled={!canSubmit}>{submitting ? "Booking..." : "Book Into Stock"}</button></footer>
  </form>;
}

function Field({ name, label, form, update, type = "text", required = false }: { name: string; label: string; form: Record<string, string | boolean>; update: (key: string, value: string) => void; type?: string; required?: boolean }) {
  return <label><span>{label}</span><input name={name} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} value={String(form[name] ?? "")} required={required} onChange={event => update(name, event.target.value)} /></label>;
}

function Select({ name, label, form, update, options }: { name: string; label: string; form: Record<string, string | boolean>; update: (key: string, value: string) => void; options: string[] }) {
  return <label><span>{label}</span><select name={name} value={String(form[name] ?? "")} onChange={event => update(name, event.target.value)}>{options.map(option => <option value={option} key={option}>{option.replaceAll("_", " ")}</option>)}</select></label>;
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickVehicleText(vehicle: Record<string, unknown>, key: string, ...nestedKeys: string[]) {
  const value = vehicle[key];
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const nestedKey of nestedKeys) {
      const nested = object[nestedKey];
      if (typeof nested === "string" || typeof nested === "number") return String(nested);
    }
  }
  return "";
}

const checkboxKeys = ["workshop_required", "pdi_required", "service_required", "mot_required", "diagnostic_required", "repair_required", "valet_required", "detail_required", "cosmetic_required", "photos_required", "video_required", "hpi_check_required", "documents_required", "spare_key_required", "transport_required"];

function labelFor(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
