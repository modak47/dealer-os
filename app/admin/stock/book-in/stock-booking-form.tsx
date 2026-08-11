"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { vehicleCheckFieldRows, type VehicleCheckSummary } from "@/lib/autotrader-vehicle-check";

type BookingResult = { stock_bike_id: number; stock_number: string; purchase_id?: string; existing?: boolean };
type LookupVehicle = {
  registration?: string;
  vin?: string;
  engineNumber?: string;
  make?: string;
  model?: string;
  derivative?: string;
  derivativeId?: string;
  vehicleId?: string;
  year?: number;
  mileage?: number;
  fuelType?: string;
  transmission?: string;
  engineSize?: number | string;
  power?: number | string;
  torque?: number | string;
  co2?: number | string;
  roadTax?: number | string;
  topSpeed?: number | string;
  gears?: number;
  lengthMm?: number;
  widthMm?: number;
  weightKg?: number;
  euroEmissions?: string;
  previousOwners?: number;
  bodyType?: string;
  colour?: string;
  firstRegistrationDate?: string;
  motExpiry?: string;
  motTests?: unknown;
  history?: unknown;
  vehicleCheck?: VehicleCheckSummary;
  taxonomyData?: Record<string, unknown>;
};
type BookingPrefill = { form?: Record<string, string | boolean>; vehicle?: LookupVehicle; message?: string };

const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value || 0);

export function StockBookingForm() {
  const router = useRouter();
  const [bookingPrefill] = useState<BookingPrefill | null>(() => readBookingPrefill());
  const [lookupReg, setLookupReg] = useState(typeof bookingPrefill?.form?.registration === "string" ? bookingPrefill.form.registration : "");
  const [lookupMessage, setLookupMessage] = useState(bookingPrefill?.message ?? "");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [identifiedVehicle, setIdentifiedVehicle] = useState<LookupVehicle | null>(bookingPrefill?.vehicle ?? null);
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
    ...(bookingPrefill?.form ?? {}),
  }));

  const purchase = numberValue(form.purchase_price);
  const prep = numberValue(form.expected_preparation_cost);
  const transport = numberValue(form.collection_transport_cost);
  const fees = numberValue(form.auction_buyer_fees) + numberValue(form.hpi_cost) + numberValue(form.other_immediate_costs);
  const retail = numberValue(form.target_retail_price);
  const totalCost = purchase + prep + transport + fees;
  const estimatedProfit = retail - totalCost;
  const vehicleCheckRows = vehicleCheckFieldRows(identifiedVehicle?.vehicleCheck);

  const canSubmit = useMemo(() => !submitting && !result, [submitting, result]);

  function update(key: string, value: string | boolean) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function updateIfBlank(key: string, value: string | number | undefined | null) {
    if (value === undefined || value === null || value === "") return;
    setForm(current => current[key] ? current : { ...current, [key]: String(value) });
  }

  async function lookupVehicle() {
    setLookupLoading(true);
    setLookupMessage("");
    setError("");
    try {
      const response = await fetch("/api/autotrader/vehicle-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vrm: lookupReg }) });
      const data = await response.json() as { vehicle?: LookupVehicle; error?: string };
      if (!response.ok || !data.vehicle) throw new Error(data.error || "Lookup failed.");
      const vehicle = data.vehicle;
      setIdentifiedVehicle(vehicle);
      update("registration", String(vehicle.registration || lookupReg).toUpperCase().replace(/\s+/g, ""));
      updateIfBlank("make", vehicle.make);
      updateIfBlank("model", vehicle.model);
      updateIfBlank("variant", vehicle.derivative);
      updateIfBlank("derivative_id", vehicle.derivativeId);
      updateIfBlank("autotrader_vehicle_id", vehicle.vehicleId);
      updateIfBlank("year", vehicle.year);
      updateIfBlank("vin", vehicle.vin?.toUpperCase());
      updateIfBlank("engine_number", vehicle.engineNumber?.toUpperCase());
      updateIfBlank("colour", vehicle.colour);
      updateIfBlank("fuel", vehicle.fuelType);
      updateIfBlank("transmission", vehicle.transmission);
      updateIfBlank("engine_cc", vehicle.engineSize);
      updateIfBlank("bhp", vehicle.power);
      updateIfBlank("torque", vehicle.torque);
      updateIfBlank("co2", vehicle.co2);
      updateIfBlank("road_tax", vehicle.roadTax);
      updateIfBlank("top_speed", vehicle.topSpeed);
      updateIfBlank("number_of_gears", vehicle.gears);
      updateIfBlank("length_mm", vehicle.lengthMm);
      updateIfBlank("width_mm", vehicle.widthMm);
      updateIfBlank("weight_kg", vehicle.weightKg);
      updateIfBlank("euro_emissions", vehicle.euroEmissions);
      updateIfBlank("previous_owners", vehicle.previousOwners);
      updateIfBlank("body_style", vehicle.bodyType);
      updateIfBlank("registration_date", vehicle.firstRegistrationDate);
      updateIfBlank("mot_expiry", vehicle.motExpiry);
      updateIfBlank("mileage", vehicle.mileage);
      if (vehicle.vehicleCheck) {
        updateIfBlank("hpi_status", vehicle.vehicleCheck.status);
        updateIfBlank("hpi_category", vehicle.vehicleCheck.category);
        if (vehicle.vehicleCheck.clear === true) update("hpi_check_required", false);
      }
      setLookupMessage(vehicle.derivativeId ? "Auto Trader lookup completed and derivative matched. Check and correct the details before booking." : "Auto Trader found the vehicle but did not return a derivative ID. You can continue manually.");
    } catch (caught) {
      setIdentifiedVehicle(null);
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
      if (identifiedVehicle?.taxonomyData) payload.autotrader_taxonomy_data = JSON.stringify(identifiedVehicle.taxonomyData);
      if (identifiedVehicle?.motTests || identifiedVehicle?.history) payload.autotrader_mot_data = JSON.stringify({ motTests: identifiedVehicle.motTests ?? null, history: identifiedVehicle.history ?? null });
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
    const bikeTitle = [form.year, form.make, form.model, form.variant].filter(Boolean).join(" ") || "Motorcycle";
    const sellerEmail = String(form.seller_email ?? "");
    const purchaseSubject = `${result.stock_number} purchase invoice - ${bikeTitle}`;
    return <section className="stock-booking-success">
      <span>Booked</span>
      <h2>{result.stock_number} - {bikeTitle}</h2>
      <p>The motorcycle, purchase record, ledger entries, preparation workflow and purchase paperwork are connected.</p>
      <div className="stock-intake-summary">
        <article><span>Seller</span><b>{String(form.seller_name ?? "Unknown seller")}</b><small>{sellerEmail || String(form.seller_phone ?? "") || "Contact not recorded"}</small></article>
        <article><span>Purchase price</span><b>{money(Number(form.purchase_price ?? 0))}</b><small>{String(form.payment_status ?? "unpaid").replaceAll("_", " ")}</small></article>
        <article><span>Target retail</span><b>{money(retail)}</b><small>Expected profit {money(estimatedProfit)}</small></article>
        <article><span>Checks to complete</span><b>{["VIN/frame", "Engine no.", "V5", "HPI", "Signed invoice"].join(" / ")}</b><small>Finish these in the vehicle jacket.</small></article>
      </div>
      <div className="stock-booking-success-actions">
        <Link className="admin-primary" href={`/admin/stock/${result.stock_bike_id}`}>Open stock record</Link>
        {result.purchase_id && <Link href={`/admin/stock/purchases/${result.purchase_id}/document?print=1`} target="_blank">Print purchase invoice</Link>}
        {result.purchase_id && <Link href={`/admin/stock/purchases/${result.purchase_id}/document`} target="_blank">Open purchase invoice</Link>}
        {sellerEmail && result.purchase_id && <a href={`mailto:${encodeURIComponent(sellerEmail)}?subject=${encodeURIComponent(purchaseSubject)}&body=${encodeURIComponent("Hi,\n\nPlease find the purchase invoice for your motorcycle attached.\n\nKind regards,\nYesMoto")}`}>Email seller</a>}
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
        <button type="button" onClick={() => void lookupVehicle()} disabled={lookupLoading || !lookupReg.trim()}>{lookupLoading ? "Searching Auto Trader..." : "Lookup Vehicle"}</button>
      </div>
      {identifiedVehicle && <div className="stock-booking-message">
        <b>{[identifiedVehicle.year, identifiedVehicle.make, identifiedVehicle.model, identifiedVehicle.derivative].filter(Boolean).join(" ")}</b>
        <span>{identifiedVehicle.registration || lookupReg}</span>
        <small>{[identifiedVehicle.engineSize ? `${identifiedVehicle.engineSize}cc` : "", identifiedVehicle.transmission, identifiedVehicle.fuelType].filter(Boolean).join(" / ")}</small>
        {identifiedVehicle.motExpiry && <small>MOT expires {identifiedVehicle.motExpiry}</small>}
        {identifiedVehicle.vehicleCheck && <small>Vehicle check: {identifiedVehicle.vehicleCheck.status}{identifiedVehicle.vehicleCheck.category ? ` / ${identifiedVehicle.vehicleCheck.category}` : ""}</small>}
        {identifiedVehicle.derivativeId && <em>Auto Trader derivative matched</em>}
      </div>}
      {vehicleCheckRows.length > 0 && <div className="stock-vehicle-check-grid">
        {vehicleCheckRows.slice(0, 10).map(field => <div key={field.label}><span>{field.label}</span><b>{field.value}</b></div>)}
      </div>}
      {lookupMessage && <p className="stock-booking-message">{lookupMessage}</p>}
    </section>

    <section>
      <header><span>2</span><div><h2>Vehicle Details</h2><p>Registration or VIN, make and model are required.</p></div></header>
      <div className="stock-booking-grid">
        <Field name="registration" label="Registration" form={form} update={update} />
        <Field name="vin" label="VIN" form={form} update={update} />
        <Field name="engine_number" label="Engine number" form={form} update={update} />
        <Field name="make" label="Make" form={form} update={update} required />
        <Field name="model" label="Model" form={form} update={update} required />
        <Field name="variant" label="Derivative / variant" form={form} update={update} />
        <Field name="derivative_id" label="Derivative ID" form={form} update={update} />
        <Field name="autotrader_vehicle_id" label="Auto Trader vehicle ID" form={form} update={update} />
        <Field name="year" label="Year" form={form} update={update} type="number" />
        <Field name="mileage" label="Mileage" form={form} update={update} type="number" />
        <Field name="engine_cc" label="Engine capacity" form={form} update={update} type="number" />
        <Field name="colour" label="Colour" form={form} update={update} />
        <Field name="body_style" label="Body type" form={form} update={update} />
        <Field name="fuel" label="Fuel type" form={form} update={update} />
        <Field name="transmission" label="Transmission" form={form} update={update} />
        <Field name="bhp" label="BHP" form={form} update={update} type="number" />
        <Field name="torque" label="Torque" form={form} update={update} />
        <Field name="co2" label="CO2" form={form} update={update} />
        <Field name="road_tax" label="Road tax" form={form} update={update} />
        <Field name="top_speed" label="Top speed" form={form} update={update} />
        <Field name="number_of_gears" label="Gears" form={form} update={update} type="number" />
        <Field name="length_mm" label="Length (mm)" form={form} update={update} type="number" />
        <Field name="width_mm" label="Width (mm)" form={form} update={update} type="number" />
        <Field name="weight_kg" label="Weight (kg)" form={form} update={update} type="number" />
        <Field name="euro_emissions" label="Euro emissions" form={form} update={update} />
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

function readBookingPrefill(): BookingPrefill | null {
  if (typeof window === "undefined") return null;
  if (!new URLSearchParams(window.location.search).has("fromRetailCheck")) return null;
  const raw = sessionStorage.getItem("dealeros.stockBookingPrefill");
  if (!raw) return null;
  sessionStorage.removeItem("dealeros.stockBookingPrefill");
  try {
    const prefill = JSON.parse(raw) as BookingPrefill;
    return { ...prefill, message: "Retail check details loaded. Confirm seller and purchase details before booking." };
  } catch {
    return { message: "Could not load the retail check prefill. You can still search by VRM." };
  }
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const checkboxKeys = ["workshop_required", "pdi_required", "service_required", "mot_required", "diagnostic_required", "repair_required", "valet_required", "detail_required", "cosmetic_required", "photos_required", "video_required", "hpi_check_required", "documents_required", "spare_key_required", "transport_required"];

function labelFor(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
