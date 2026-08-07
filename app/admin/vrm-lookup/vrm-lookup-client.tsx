"use client";

import { FormEvent, useState } from "react";

type LookupResult = { vehicle?: LookupVehicle; error?: string; [key: string]: unknown };
type LookupVehicle = Record<string, unknown> & {
  registration?: string;
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
  bodyType?: string;
  colour?: string;
  doors?: number;
  seats?: number;
  vin?: string;
  engineNumber?: string;
  firstRegistrationDate?: string;
  previousOwners?: number;
  motExpiry?: string;
  motTests?: unknown;
  history?: unknown;
  power?: number | string;
  powerPs?: number | string;
  torque?: number | string;
  co2?: number | string;
  roadTax?: number | string;
  topSpeed?: number | string;
  gears?: number;
  lengthMm?: number;
  widthMm?: number;
  weightKg?: number;
  euroEmissions?: string;
};
type DisplayField = { label: string; value: string };

const text = (value: unknown) => typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
const shown = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.map(item => typeof item === "object" ? JSON.stringify(item) : String(item)).join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
const mileage = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString("en-GB")} miles` : `${String(value)} miles`;
};
const prettyVrm = (value: string) => {
  const clean = value.replace(/\s+/g, "").toUpperCase();
  return clean.length === 7 ? `${clean.slice(0, 4)} ${clean.slice(4)}` : value || "-";
};

function DataGrid({ fields }: { fields: DisplayField[] }) {
  return <div className="vehicle-data-grid">{fields.map(field => <div className={field.value === "-" ? "missing" : ""} key={field.label}><span>{field.label}</span><strong>{field.value}</strong></div>)}</div>;
}

export function VrmLookupClient() {
  const [vrm, setVrm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [copied, setCopied] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = vrm.trim().replace(/\s+/g, "").toUpperCase();
    if (!cleaned) {
      setError("Enter a registration number.");
      setResult(null);
      return;
    }
    setVrm(cleaned);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/autotrader/vehicle-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vrm: cleaned }),
      });
      const data = await response.json() as LookupResult;
      if (!response.ok) throw new Error(data.error || "Vehicle lookup failed.");
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vehicle lookup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string, name: string) {
    if (!value || value === "-") return;
    await navigator.clipboard.writeText(value);
    setCopied(name);
    window.setTimeout(() => setCopied(""), 1600);
  }

  function reset() {
    setVrm("");
    setResult(null);
    setError("");
    setCopied("");
    window.setTimeout(() => document.getElementById("vrm")?.focus(), 0);
  }

  const vehicle = result?.vehicle ?? {};
  const registration = prettyVrm(text(vehicle.registration) || vrm);
  const make = text(vehicle.make) || "-";
  const model = text(vehicle.model) || "-";
  const derivative = text(vehicle.derivative) || "-";
  const body = text(vehicle.bodyType) || "-";
  const fuel = text(vehicle.fuelType) || "-";
  const transmission = text(vehicle.transmission) || "-";
  const engine = vehicle.engineSize ? `${vehicle.engineSize}cc` : "-";
  const year = shown(vehicle.year);
  const colour = shown(vehicle.colour);
  const vin = shown(vehicle.vin);
  const engineNumber = shown(vehicle.engineNumber);
  const motExpiry = shown(vehicle.motExpiry);
  const headline = [year, make, model, derivative].filter(value => value !== "-").join(" ") || registration;
  const subline = [colour, fuel, engine].filter(value => value !== "-").join(" / ");

  const vehicleFields: DisplayField[] = [
    { label: "Registration", value: registration },
    { label: "Make", value: make },
    { label: "Model", value: model },
    { label: "Derivative", value: derivative },
    { label: "Derivative ID", value: shown(vehicle.derivativeId) },
    { label: "Vehicle ID", value: shown(vehicle.vehicleId) },
    { label: "Year", value: year },
    { label: "Colour", value: colour },
    { label: "Body Style", value: body },
    { label: "Doors", value: shown(vehicle.doors) },
    { label: "Seats", value: shown(vehicle.seats) },
  ];
  const motFields: DisplayField[] = [
    { label: "MOT Expiry", value: motExpiry },
    { label: "Mileage", value: mileage(vehicle.mileage) },
    { label: "MOT Tests", value: shown(vehicle.motTests) },
    { label: "History", value: shown(vehicle.history) },
  ];
  const keeperFields: DisplayField[] = [
    { label: "First Registered", value: shown(vehicle.firstRegistrationDate) },
    { label: "Previous Owners", value: shown(vehicle.previousOwners) },
    { label: "VIN", value: vin },
    { label: "Engine Number", value: engineNumber },
  ];
  const technicalFields: DisplayField[] = [
    { label: "Fuel", value: fuel },
    { label: "Transmission", value: transmission },
    { label: "Engine", value: engine },
    { label: "BHP", value: shown(vehicle.power) },
    { label: "PS", value: shown(vehicle.powerPs) },
    { label: "Torque", value: shown(vehicle.torque) },
    { label: "CO2", value: shown(vehicle.co2) },
    { label: "Road Tax", value: shown(vehicle.roadTax) },
    { label: "Top Speed", value: shown(vehicle.topSpeed) },
    { label: "Gears", value: shown(vehicle.gears) },
    { label: "Length", value: shown(vehicle.lengthMm) },
    { label: "Width", value: shown(vehicle.widthMm) },
    { label: "Weight", value: shown(vehicle.weightKg) },
    { label: "Euro Status", value: shown(vehicle.euroEmissions) },
  ];

  return <div className="vrm-tool"><section className="vrm-search-card"><div><span className="vrm-icon">AT</span><div><h2>LOOK UP A VEHICLE</h2><p>Enter a registration to retrieve Auto Trader vehicle and taxonomy data.</p></div></div><form onSubmit={submit}><label htmlFor="vrm">Registration number</label><div><input id="vrm" value={vrm} onChange={event => setVrm(event.target.value.toUpperCase())} placeholder="YM21 NZK" autoComplete="off" maxLength={10} disabled={loading} /><button type="submit" disabled={loading}>{loading ? <><i />Searching Auto Trader...</> : "Lookup vehicle"}</button></div></form></section>
    {error && <div className="vrm-error" role="alert"><b>Lookup unsuccessful</b><p>{error}</p></div>}
    {result && <section className="vehicle-summary"><header><div className="vehicle-title"><span className="summary-icon">OK</span><div><p>AUTO TRADER VEHICLE SUMMARY</p><h2>{headline}</h2><small>{subline || "Vehicle data returned successfully"}</small></div></div><strong className="registration-plate">{registration}</strong></header>
      <div className="vehicle-badges">{vehicle.derivativeId ? <span className="good">Derivative matched</span> : <span className="exempt">No derivative ID</span>}{motExpiry !== "-" && <span className="good">MOT expires {motExpiry}</span>}{vehicle.vehicleId && <span className="good">Vehicle ID returned</span>}</div>
      <div className="summary-highlights">{[{ label: "Registration", value: registration }, { label: "Year", value: year }, { label: "Colour", value: colour }, { label: "Fuel", value: fuel }, { label: "Transmission", value: transmission }, { label: "Engine", value: engine }].map(field => <div key={field.label}><span>{field.label}</span><strong>{field.value}</strong></div>)}</div>
      <div className="vehicle-actions"><button onClick={() => copy(registration, "Registration")}>Copy {copied === "Registration" ? "Copied" : "Registration"}</button><button onClick={() => copy(vin, "VIN")}>{copied === "VIN" ? "Copied" : "Copy VIN"}</button><button onClick={() => copy(JSON.stringify(result, null, 2), "JSON")}>{copied === "JSON" ? "Copied" : "Copy JSON"}</button><button className="primary" onClick={reset}>New Lookup</button></div>
      <div className="vehicle-sections"><details open><summary><span>+</span> Vehicle Details <i>+</i></summary><DataGrid fields={vehicleFields} /></details><details><summary><span>+</span> MOT &amp; Mileage <i>+</i></summary><DataGrid fields={motFields} /></details><details><summary><span>+</span> Keeper / Identity <i>+</i></summary><DataGrid fields={keeperFields} /></details><details><summary><span>+</span> Technical Data <i>+</i></summary><DataGrid fields={technicalFields} /></details><details className="raw-json"><summary><span>+</span> Raw Auto Trader JSON <i>+</i></summary><pre>{JSON.stringify(result, null, 2)}</pre></details></div>
    </section>}
  </div>;
}
