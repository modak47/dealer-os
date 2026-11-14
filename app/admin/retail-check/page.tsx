"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normaliseVehicleCheck, vehicleCheckFieldRows, type VehicleCheckSummary } from "@/lib/autotrader-vehicle-check";

import buyingStyles from "../opportunities/opportunities.module.css";
import { formatAdvertMoney, getValidAdvertUrl } from "../opportunities/opportunity-utils";
import styles from "./retail-check.module.css";
import { retailComparableValues, retailOfferFigures } from "./retail-display";

const retailTabs = [
  { id: "vehicle", label: "Vehicle" },
  { id: "vehicle-check", label: "Vehicle check" },
  { id: "valuation", label: "Valuation" },
  { id: "comparables", label: "Comparables" },
  { id: "history", label: "History" },
] as const;

type RetailCheck = Record<string, any> & { id?: string | number; Status?: string };
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
  bodyType?: string;
  colour?: string;
  previousOwners?: number;
  firstRegistrationDate?: string;
  motExpiry?: string;
  motTests?: unknown;
  history?: unknown;
  check?: unknown;
  vehicleCheck?: VehicleCheckSummary;
  taxonomyData?: Record<string, unknown>;
};

const terminalStatuses = new Set(["Checked", "Manual Review", "Failed", "Cancelled"]);

function progressValue(record: RetailCheck | null) {
  const value = Number(record?.["Progress Percent"]);
  if (Number.isFinite(value)) return Math.max(0, Math.min(100, value));
  if (record?.Status === "Checked") return 100;
  if (record?.Status === "Processing") return 25;
  return record?.Status === "Pending" ? 0 : 0;
}

function safeProgressMessage(record: RetailCheck | null) {
  if (!record) return "";
  if (record["Progress Message"]) return String(record["Progress Message"]);
  if (record.Status === "Pending") return "Your retail check has been queued.";
  if (record.Status === "Processing") return "Your retail check is being processed.";
  if (record.Status === "Checked") return "Retail check complete.";
  if (record.Status === "Manual Review") return "Not enough reliable comparable motorcycles were found. This check needs manual review.";
  if (record.Status === "Failed") return "The retail check could not be completed.";
  return "";
}

function elapsedSince(value: unknown) {
  if (!value) return "";
  const started = new Date(String(value)).getTime();
  if (!Number.isFinite(started)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function shown(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function FieldGrid({ fields }: { fields: Array<{ label: string; value: unknown }> }) {
  return (
    <div className={styles.detailGrid}>
      {fields.map(field => (
        <div key={field.label}>
          <span>{field.label}</span>
          <b>{shown(field.value)}</b>
        </div>
      ))}
    </div>
  );
}

function KPI({
  title,
  value,
  highlight = false,
  valueClass = "",
}: {
  title: string;
  value: any;
  highlight?: boolean;
  valueClass?: string;
}) {
  return (
    <div className={`${buyingStyles.kpi} ${styles.kpi} ${highlight ? buyingStyles.kpiAccent : ""}`}>
      <p>{title}</p>
      <strong className={valueClass}>{value ?? "—"}</strong>
    </div>
  );
}


export default function RetailCheckPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [makes, setMakes] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [registration, setRegistration] =
    useState(searchParams.get("reg")?.toUpperCase() ?? "");
  const [year, setYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const [identifiedVehicle, setIdentifiedVehicle] = useState<LookupVehicle | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [recordId, setRecordId] = useState(searchParams.get("recordId") ?? "");
  const [requestId, setRequestId] = useState(searchParams.get("requestId") ?? "");
  const [websiteLeadId] = useState(searchParams.get("leadId") ?? "");
  const [valuation, setValuation] = useState<RetailCheck | null>(null);
  const [status, setStatus] = useState("");
  const [elapsedTick, setElapsedTick] = useState(0);
  const [activeTab, setActiveTab] = useState("valuation");
  const [derivative, setDerivative] =
  useState("");

  const [derivativeId, setDerivativeId] =
    useState("");

  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [referenceError, setReferenceError] = useState("");
  const [historyRecords, setHistoryRecords] =
    useState<any[]>([]);

  const [selectedHistoryRecord, setSelectedHistoryRecord] =
    useState<any>(null);
  const activeCheckIdRef = useRef(recordId);
  const submissionGenerationRef = useRef(0);

  async function syncWebsiteLeadValuation(leadId:string, retailCheckId:string, data:Record<string, unknown>) {
    const retail = Number(data["Market Retail"]) || null;
    const offer = Number(data["Suggested Offer"]) || null;
    const margin = Number(data["Available Margin"]) || (retail && offer ? retail - offer : null);
    await fetch(`/api/website-leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        retail_check_id: retailCheckId,
        valuation_status: "completed",
        valuation_completed_at: new Date().toISOString(),
        valuation_error: null,
        retail_estimate: retail,
        suggested_offer: offer,
        estimated_margin: margin,
        valuation_notes: [data["Buy Decision"] && `Buy decision: ${data["Buy Decision"]}`, data["Confidence"] && `Confidence: ${data["Confidence"]}`, data["Opportunity Score"] && `Opportunity score: ${data["Opportunity Score"]}`].filter(Boolean).join("\n"),
        similar_bikes: data["Comparable Summary"] || null,
      }),
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [makesResponse, modelsResponse] = await Promise.all([fetch("/api/makes"), fetch("/api/models")]);
        if (!makesResponse.ok || !modelsResponse.ok) throw new Error("Manual make and model lists are unavailable. You can still search by registration.");
        const [nextMakes, nextModels] = await Promise.all([makesResponse.json(), modelsResponse.json()]);
        if (!Array.isArray(nextMakes) || !Array.isArray(nextModels)) throw new Error("Manual make and model lists are unavailable. You can still search by registration.");
        if (!cancelled) { setMakes(nextMakes); setModels(nextModels); }
      } catch (error) {
        if (!cancelled) setReferenceError(error instanceof Error ? error.message : "Unable to load manual search options.");
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!recordId) return;
    activeCheckIdRef.current = recordId;
    let cancelled = false;

    async function loadCurrent() {
      const expectedId = recordId;
      const response = await fetch(`/api/retail-check/${recordId}`);
      const data = await response.json();
      if (!cancelled && activeCheckIdRef.current === expectedId && !data.error) {
        setValuation(data);
        setStatus(data.Status === "Checked" ? "Valuation Complete" : String(data.Status ?? "Pending"));
        setActiveTab("valuation");
      }
    }

    loadCurrent();
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/retail-history");
    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) throw new Error(data?.error || "Unable to load previous valuations.");
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadHistory()
      .then(data => { if (!cancelled) setHistoryRecords(data); })
      .catch(error => { if (!cancelled) setHistoryError(error instanceof Error ? error.message : "Unable to load previous valuations."); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [loadHistory]);

  async function retryHistory() {
    setHistoryLoading(true);
    setHistoryError("");
    try { setHistoryRecords(await loadHistory()); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : "Unable to load previous valuations."); }
    finally { setHistoryLoading(false); }
  }

  useEffect(() => {
    if (!recordId) return;
    activeCheckIdRef.current = recordId;
    let stopped = false;
    let syncedLead = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const watchedId = recordId;

    function stopPollingIfTerminal(record: RetailCheck) {
      if (terminalStatuses.has(String(record.Status)) && pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    async function refresh() {
      const response = await fetch(`/api/retail-check/${watchedId}`);
      const data = await response.json();
      if (stopped || activeCheckIdRef.current !== watchedId || String(data.id) !== String(watchedId) || data.error) return;
      setValuation(data);
      setStatus(data.Status === "Checked" ? "Valuation Complete" : String(data.Status ?? "Pending"));
      stopPollingIfTerminal(data);
      if (data.Status === "Checked" && websiteLeadId && !syncedLead) {
        syncedLead = true;
        await syncWebsiteLeadValuation(websiteLeadId, watchedId, data);
      }
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`retail-check-${watchedId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "retail_checks", filter: `id=eq.${watchedId}` }, async payload => {
        const next = payload.new as RetailCheck;
        if (stopped || activeCheckIdRef.current !== watchedId || String(next.id) !== String(watchedId)) return;
        setValuation(next);
        setStatus(next.Status === "Checked" ? "Valuation Complete" : String(next.Status ?? "Pending"));
        stopPollingIfTerminal(next);
        if (next.Status === "Checked" && websiteLeadId && !syncedLead) {
          syncedLead = true;
          await syncWebsiteLeadValuation(websiteLeadId, watchedId, next);
        }
      })
      .subscribe();

    refresh();
    pollInterval = setInterval(() => void refresh(), 5000);

    return () => {
      stopped = true;
      if (pollInterval) clearInterval(pollInterval);
      void supabase.removeChannel(channel);
    };
  }, [recordId, websiteLeadId]);

  useEffect(() => {
    if (!valuation || terminalStatuses.has(String(valuation.Status))) return;
    const interval = setInterval(() => setElapsedTick(tick => tick + 1), 1000);
    return () => clearInterval(interval);
  }, [valuation]);

  const filteredModels = models
    .filter((m: any) => m.make === selectedMake && m.model)
    .sort((a: any, b: any) =>
      String(a.model).localeCompare(String(b.model))
    );

  async function lookupRegistration() {
    setLookupLoading(true);
    setLookupMessage("");
    setSubmitError("");
    try {
      const response = await fetch("/api/autotrader/vehicle-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vrm: registration }),
      });
      const data = await response.json() as { vehicle?: LookupVehicle; error?: string };
      if (!response.ok || !data.vehicle) throw new Error(data.error || "Auto Trader lookup failed.");
      const vehicle = data.vehicle;
      setIdentifiedVehicle(vehicle);
      setRegistration(String(vehicle.registration || registration).toUpperCase().replace(/\s+/g, ""));
      if (vehicle.make) setSelectedMake(vehicle.make);
      if (vehicle.model) setSelectedModel(vehicle.model);
      if (vehicle.year) setYear(String(vehicle.year));
      if (vehicle.mileage && !mileage) setMileage(String(vehicle.mileage));
      setDerivative(vehicle.derivative || "");
      setDerivativeId(vehicle.derivativeId || "");
      setShowManualSearch(false);
      if (vehicle.vehicleCheck) setActiveTab("vehicle-check");
      setLookupMessage(vehicle.derivativeId ? "Auto Trader derivative matched." : "Vehicle found. No derivative ID returned; you can continue manually.");
    } catch (caught) {
      setIdentifiedVehicle(null);
      setShowManualSearch(true);
      setLookupMessage(caught instanceof Error ? caught.message : "Auto Trader lookup unavailable. Continue manually.");
    } finally {
      setLookupLoading(false);
    }
}

  async function checkMarket() {
    const generation = submissionGenerationRef.current + 1;
    submissionGenerationRef.current = generation;
    try {
      setSubmitError("");
      if (!registration.trim()) throw new Error("Registration is required.");
      if (!mileage.trim() || !Number.isFinite(Number(mileage))) throw new Error("Mileage is required.");
      if (askingPrice && !Number.isFinite(Number(askingPrice))) throw new Error("Asking price must be a number.");
      setLoading(true);
      activeCheckIdRef.current = "";
      setRecordId("");
      setSelectedHistoryRecord(null);
      setValuation(null);
      setStatus("Starting Check...");
      setElapsedTick(0);
      const nextRequestId = crypto.randomUUID();
      setRequestId(nextRequestId);

      const response = await fetch("/api/retail-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration,
          make: selectedMake,
          model: selectedModel,
          year,
          mileage,
          askingPrice,
          leadId: websiteLeadId || undefined,
          requestId: nextRequestId,
          derivative,
          derivativeId,
          autotraderVehicleId: identifiedVehicle?.vehicleId,
          autotraderTaxonomyData: identifiedVehicle?.taxonomyData,
          autotraderMotData: identifiedVehicle ? { motTests: identifiedVehicle.motTests ?? null, history: identifiedVehicle.history ?? null, check: identifiedVehicle.check ?? null } : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create Retail Check");
      if (submissionGenerationRef.current !== generation) return;
      if (!data.recordId) throw new Error("Retail Check was not created.");

      activeCheckIdRef.current = String(data.recordId);
      setValuation(data.record || null);

      setActiveTab("valuation");

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      setStatus("Pending");
      setRecordId(data.recordId); 
    } catch (error) {
      console.error(error);
      if (submissionGenerationRef.current === generation) {
        setSubmitError(error instanceof Error ? error.message : "Failed to create Retail Check");
      }
    } finally {
      if (submissionGenerationRef.current === generation) setLoading(false);
    }
  }

  async function retryCurrentCheck() {
    if (!recordId || valuation?.Status !== "Failed") return;
    setLoading(true);
    setSubmitError("");
    try {
      const response = await fetch(`/api/retail-check/${recordId}/retry`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to retry Retail Check");
      setValuation(data.record || null);
      setStatus("Pending");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to retry Retail Check");
    } finally {
      setLoading(false);
    }
  }

  const displayedValuation =
  selectedHistoryRecord || valuation;

  // A saved check must not inherit another bike's current lookup details.
  const displayedVehicle = selectedHistoryRecord ? null : identifiedVehicle;

  const storedMotData = displayedValuation?.["Auto Trader MOT Data"];
  const storedMotObject = storedMotData && typeof storedMotData === "object" && !Array.isArray(storedMotData) ? storedMotData as Record<string, unknown> : null;
  const currentVehicleCheck = displayedVehicle?.vehicleCheck ?? (storedMotObject && Object.keys(storedMotObject).length ? normaliseVehicleCheck(storedMotObject.check ?? storedMotObject.history ?? storedMotObject, { motExpiry: displayedVehicle?.motExpiry, previousOwners: displayedVehicle?.previousOwners }) : null);
  const currentVehicleCheckRows = vehicleCheckFieldRows(currentVehicleCheck);
  const vehicleDetailFields = [
    { label: "Registration", value: displayedVehicle?.registration || displayedValuation?.Registration || registration },
    { label: "VIN", value: displayedVehicle?.vin },
    { label: "Engine number", value: displayedVehicle?.engineNumber },
    { label: "Make", value: displayedVehicle?.make || displayedValuation?.Make || selectedMake },
    { label: "Model", value: displayedVehicle?.model || displayedValuation?.Model || selectedModel },
    { label: "Derivative", value: displayedVehicle?.derivative || displayedValuation?.Derivative || (!selectedHistoryRecord && derivative) },
    { label: "Derivative ID", value: displayedVehicle?.derivativeId || displayedValuation?.["Derivative ID"] || (!selectedHistoryRecord && derivativeId) },
    { label: "AutoTrader vehicle ID", value: displayedVehicle?.vehicleId || displayedValuation?.["Auto Trader Vehicle ID"] },
    { label: "Year", value: displayedVehicle?.year || displayedValuation?.Year || year },
    { label: "Mileage", value: displayedVehicle?.mileage || displayedValuation?.Mileage || mileage },
    { label: "First registered", value: displayedVehicle?.firstRegistrationDate },
    { label: "Previous owners", value: displayedVehicle?.previousOwners || currentVehicleCheck?.previousOwners },
    { label: "Colour", value: displayedVehicle?.colour },
    { label: "Body type", value: displayedVehicle?.bodyType },
    { label: "Fuel", value: displayedVehicle?.fuelType },
    { label: "Transmission", value: displayedVehicle?.transmission },
    { label: "Engine", value: displayedVehicle?.engineSize ? `${displayedVehicle?.engineSize}cc` : "" },
    { label: "BHP", value: displayedVehicle?.power },
    { label: "PS", value: displayedVehicle?.powerPs },
    { label: "Torque", value: displayedVehicle?.torque },
    { label: "CO2", value: displayedVehicle?.co2 },
    { label: "Road tax", value: displayedVehicle?.roadTax },
    { label: "Top speed", value: displayedVehicle?.topSpeed },
    { label: "Gears", value: displayedVehicle?.gears },
    { label: "Length", value: displayedVehicle?.lengthMm },
    { label: "Width", value: displayedVehicle?.widthMm },
    { label: "Weight", value: displayedVehicle?.weightKg },
    { label: "Euro emissions", value: displayedVehicle?.euroEmissions },
    { label: "MOT expiry", value: displayedVehicle?.motExpiry || currentVehicleCheck?.motExpiry },
    { label: "HPI status", value: currentVehicleCheck?.status },
    { label: "Write-off category", value: currentVehicleCheck?.category },
  ];

  const progress =
    progressValue(valuation);

  const progressMessage =
    safeProgressMessage(valuation);

  const elapsed =
    elapsedTick >= 0 ? elapsedSince(valuation?.["Queued At"] || valuation?.created_at) : "";

  const activeCheckRunning =
    ["Pending", "Processing"].includes(String(valuation?.Status ?? ""));

  const runButtonDisabled =
    loading || activeCheckRunning;

  function bookIntoStock() {
    const purchase = offerPrice || String(displayedValuation?.["Suggested Offer"] || "");
    const retail = String(displayedValuation?.["Market Retail"] || askingPrice || "");
    const vehicle: LookupVehicle = displayedVehicle ?? {
      registration: displayedValuation?.Registration || registration,
      make: displayedValuation?.Make || selectedMake,
      model: displayedValuation?.Model || selectedModel,
      derivative: displayedValuation?.Derivative || (!selectedHistoryRecord ? derivative : ""),
      derivativeId: displayedValuation?.["Derivative ID"] || (!selectedHistoryRecord ? derivativeId : ""),
      year: displayedValuation?.Year || (year ? Number(year) : undefined),
      mileage: displayedValuation?.Mileage ?? (mileage ? Number(mileage) : undefined),
      vehicleCheck: currentVehicleCheck ?? undefined,
      taxonomyData: displayedValuation?.["Auto Trader Taxonomy Data"] as Record<string, unknown> | undefined,
      history: storedMotObject?.history,
      check: storedMotObject?.check,
      motTests: storedMotObject?.motTests,
    };
    sessionStorage.setItem("dealeros.stockBookingPrefill", JSON.stringify({
      vehicle,
      form: {
        registration: String(vehicle.registration || registration).toUpperCase().replace(/\s+/g, ""),
        make: String(vehicle.make || selectedMake || ""),
        model: String(vehicle.model || selectedModel || ""),
        variant: String(vehicle.derivative || (!selectedHistoryRecord ? derivative : "") || ""),
        derivative_id: String(vehicle.derivativeId || (!selectedHistoryRecord ? derivativeId : "") || ""),
        autotrader_vehicle_id: String(vehicle.vehicleId || displayedValuation?.["Auto Trader Vehicle ID"] || ""),
        vin: String(vehicle.vin || ""),
        engine_number: String(vehicle.engineNumber || ""),
        year: vehicle.year ? String(vehicle.year) : year,
        mileage: vehicle.mileage ? String(vehicle.mileage) : mileage,
        engine_cc: vehicle.engineSize ? String(vehicle.engineSize) : "",
        bhp: vehicle.power ? String(vehicle.power) : "",
        torque: vehicle.torque ? String(vehicle.torque) : "",
        co2: vehicle.co2 ? String(vehicle.co2) : "",
        road_tax: vehicle.roadTax ? String(vehicle.roadTax) : "",
        top_speed: vehicle.topSpeed ? String(vehicle.topSpeed) : "",
        number_of_gears: vehicle.gears ? String(vehicle.gears) : "",
        length_mm: vehicle.lengthMm ? String(vehicle.lengthMm) : "",
        width_mm: vehicle.widthMm ? String(vehicle.widthMm) : "",
        weight_kg: vehicle.weightKg ? String(vehicle.weightKg) : "",
        euro_emissions: vehicle.euroEmissions ? String(vehicle.euroEmissions) : "",
        colour: String(vehicle.colour || ""),
        body_style: String(vehicle.bodyType || ""),
        fuel: String(vehicle.fuelType || ""),
        transmission: String(vehicle.transmission || ""),
        registration_date: String(vehicle.firstRegistrationDate || ""),
        mot_expiry: String(vehicle.motExpiry || currentVehicleCheck?.motExpiry || ""),
        previous_owners: vehicle.previousOwners == null ? "" : String(vehicle.previousOwners),
        hpi_status: currentVehicleCheck?.status || "",
        hpi_category: currentVehicleCheck?.category || "",
        target_retail_price: retail,
        purchase_price: purchase,
        purchase_source: websiteLeadId ? "website_lead" : "buying_opportunity",
        website_lead_id: websiteLeadId,
        hpi_check_required: currentVehicleCheck?.clear === true ? false : true,
      },
    }));
    router.push(`/admin/stock/book-in?fromRetailCheck=${encodeURIComponent(String(displayedValuation?.id || recordId || requestId || vehicle.registration || registration || "lookup"))}`);
  }

  const { profit, margin } = retailOfferFigures(displayedValuation?.["Market Retail"], offerPrice);

  const bikeHistory =
  [...historyRecords].sort(
    (a: any, b: any) =>
      new Date(b.createdTime).getTime() -
      new Date(a.createdTime).getTime()
  );

  function viewHistoryRecord(record: RetailCheck) {
    setSelectedHistoryRecord(record);
    setActiveTab("valuation");
  }

  function moveTabFocus(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % retailTabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + retailTabs.length) % retailTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = retailTabs.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(retailTabs[next].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <main className={`${buyingStyles.page} ${styles.page}`}>
      <div className={buyingStyles.container}>
        <header className={buyingStyles.pageHeader}>
          <div>
            <p className={buyingStyles.eyebrow}>Buying tools <span>/</span> Retail checker</p>
            <h1>Retail Checker</h1>
            <p className={buyingStyles.subtitle}>Know the bike. Compare the market. Make a confident offer.</p>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={() => setActiveTab("history")}>View previous valuations <span aria-hidden="true">↗</span></button>
        </header>

        <div className={styles.workspace}>
          <aside className={styles.searchPanel} aria-label="Bike details and retail check">
            <div className={styles.panelHeading}><span className={buyingStyles.eyebrow}>Start a check</span><h2>Bike details</h2><p>Search a registration, then run a retail check using the current mileage.</p></div>
            <div className={styles.searchFields}>
              <label className={styles.field}><span>Registration</span><input className={styles.registrationInput} type="text" placeholder="AB12 CDE" value={registration} onChange={e => setRegistration(e.target.value.toUpperCase())} /></label>
              <label className={styles.field}><span>Mileage</span><input type="number" placeholder="e.g. 8,500" value={mileage} onChange={e => setMileage(e.target.value)} /></label>
              <button type="button" onClick={() => void lookupRegistration()} disabled={lookupLoading || !registration.trim()} className={styles.lookupButton}>{lookupLoading ? "Searching Auto Trader..." : "Search Auto Trader"}</button>
            </div>

            {identifiedVehicle && <div className={styles.identifiedCard}>
              <span className={styles.registrationBadge}>{identifiedVehicle.registration || registration}</span>
              <strong>{[identifiedVehicle.year, identifiedVehicle.make, identifiedVehicle.model].filter(Boolean).join(" ") || "Vehicle found"}</strong>
              <p>{identifiedVehicle.derivative || "Derivative details not supplied"}</p>
              {identifiedVehicle.vehicleCheck && <span className={styles.checkBadge} data-warning={identifiedVehicle.vehicleCheck.clear === false}>{identifiedVehicle.vehicleCheck.status}</span>}
              <div className={styles.identifiedFacts}>
                <span>Engine<b>{identifiedVehicle.engineSize ? `${identifiedVehicle.engineSize}cc` : "—"}</b></span>
                <span>Transmission<b>{identifiedVehicle.transmission || "—"}</b></span>
                <span>Fuel<b>{identifiedVehicle.fuelType || "—"}</b></span>
                <span>MOT<b>{identifiedVehicle.motExpiry || "—"}</b></span>
              </div>
              {identifiedVehicle.derivativeId && <p className={styles.matched}>Derivative matched</p>}
              <button type="button" onClick={bookIntoStock} className={styles.secondaryButton}>Book Into Stock</button>
            </div>}
            {lookupMessage && <p role="status" className={styles.helperMessage}>{lookupMessage}</p>}
            {derivative && !identifiedVehicle && <p className={styles.helperMessage}>{derivative}</p>}

            <button type="button" aria-expanded={showManualSearch} aria-controls="retail-manual-search" onClick={() => setShowManualSearch(!showManualSearch)} className={styles.manualToggle}>{showManualSearch ? "Hide Manual Search" : "Manual Search"}<span aria-hidden="true">{showManualSearch ? "−" : "+"}</span></button>
            <div id="retail-manual-search" hidden={!showManualSearch} className={styles.manualFields}>
              {referenceError && <p role="alert" className={styles.helperMessage}>{referenceError}</p>}
              <label className={styles.field}><span>Make</span><select aria-label="Make" value={selectedMake} onChange={e => { setSelectedMake(e.target.value); setSelectedModel(""); }}>
                <option value="">Select Make</option>{[...makes].filter((m:any) => m?.make).sort((a:any,b:any) => String(a.make).localeCompare(String(b.make))).map((m:any) => <option key={m.make} value={m.make}>{m.make}</option>)}
              </select></label>
              <label className={styles.field}><span>Model</span><select aria-label="Model" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}><option value="">Select Model</option>{filteredModels.map((m:any) => <option key={`${m.make}-${m.model}`} value={m.model}>{m.model}</option>)}</select></label>
              <label className={styles.field}><span>Year</span><input type="number" placeholder="e.g. 2021" value={year} onChange={e => setYear(e.target.value)} /></label>
            </div>

            <button type="button" onClick={checkMarket} disabled={runButtonDisabled} className={`${buyingStyles.primaryButton} ${styles.runButton}`}>{loading ? "Starting Check..." : activeCheckRunning ? "Valuation Running..." : "Run Retail Check"}</button>
            {submitError && <div role="alert" className={styles.errorState}>{submitError}</div>}
            {(status || valuation) && <div className={styles.progressCard} aria-live="polite">
              <div className={styles.progressHeading}><strong>{valuation?.Status || status}</strong><span>{elapsed}</span></div>
              <p>{valuation?.Registration || registration}</p>
              <span className={styles.progressStage}>{valuation?.["Progress Stage"] || "Queued"}</span>
              <div className={styles.progressTrack} role="progressbar" aria-label="Retail check progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div>
              <p>{progressMessage || "Waiting for market analysis..."}</p>
              {valuation?.Status === "Failed" && <button type="button" onClick={retryCurrentCheck} disabled={loading} className={styles.secondaryButton}>{loading ? "Retrying..." : "Retry Retail Check"}</button>}
            </div>}
          </aside>

          <section className={styles.results} aria-label="Retail check results">
            {displayedValuation && <div className={styles.vehicleSummary}>
              <div><p className={buyingStyles.eyebrow}>{selectedHistoryRecord ? "Saved valuation" : "Your valuation"}</p><h2>{displayedValuation.Make} {displayedValuation.Model}</h2><p>{displayedValuation.Registration} <span>·</span> {displayedValuation.Year || "Year unknown"} <span>·</span> {displayedValuation.Mileage == null ? "Mileage unknown" : `${Number(displayedValuation.Mileage).toLocaleString()} miles`}</p></div>
              <div className={styles.buyDecision} data-decision={String(displayedValuation["Buy Decision"] || "").toUpperCase()}><span>Buy decision</span><strong>{displayedValuation["Buy Decision"] || "Pending"}</strong></div>
            </div>}
            {selectedHistoryRecord && <div className={styles.historyBanner}><span>Viewing a saved valuation</span><button type="button" className={styles.textButton} onClick={() => setSelectedHistoryRecord(null)}>Return To Current Valuation <span aria-hidden="true">↗</span></button></div>}

            <div className={styles.resultsPanel}>
              <div className={styles.tabs} role="tablist" aria-label="Retail check sections">
                {retailTabs.map((tab,index) => <button type="button" key={tab.id} id={`retail-tab-${tab.id}`} role="tab" aria-selected={activeTab === tab.id} aria-controls={`retail-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={event => moveTabFocus(event,index)}>{tab.label}{tab.id === "history" && <span>{historyRecords.length}</span>}</button>)}
              </div>
              <div className={styles.tabContent} role="tabpanel" id={`retail-panel-${activeTab}`} aria-labelledby={`retail-tab-${activeTab}`} tabIndex={0}>
                {!displayedValuation && !identifiedVehicle && activeTab !== "history" && activeTab !== "vehicle-check" && <div className={styles.emptyState}>
                  <span className={styles.emptyIcon} aria-hidden="true">↗</span><p className={buyingStyles.eyebrow}>Ready when you are</p><h2>Start with a registration</h2><p>Identify a bike and run a retail check to bring together market prices, vehicle details and your buying figures.</p>
                  <div className={styles.emptySteps}><span><b>01</b>Identify the bike</span><span><b>02</b>Compare the market</span><span><b>03</b>Review your offer</span></div>
                </div>}

                {displayedValuation && activeTab === "valuation" && <>
                  <div className={styles.sectionIntro}><div><h3>Market valuation</h3><p>Compare current adverts with Percayso / CAP guide values.</p></div><span className={styles.sourceTag}>Two market perspectives</span></div>
                  <div className={styles.markets}>
                    <section className={styles.marketPanel} aria-label="AutoTrader Market"><div className={styles.marketTitle}><span className={styles.sourceDot} /><h3>AutoTrader Market</h3></div><div className={styles.metricGrid}>
                      <KPI title="Market Retail" value={formatAdvertMoney(displayedValuation["Market Retail"], "Not available")} highlight />
                      <KPI title="Fast Sale" value={formatAdvertMoney(displayedValuation["Fast Sale Retail"], "Not available")} />
                      <KPI title="Premium Retail" value={formatAdvertMoney(displayedValuation["Premium Retail"], "Not available")} />
                      <KPI title="Comparables" value={displayedValuation["Comparable Count"] ?? 0} />
                      <KPI title="Confidence" value={displayedValuation["Confidence"] || "—"} />
                      <KPI title="Opportunity Score" value={displayedValuation["Opportunity Score"] ?? 0} />
                    </div></section>
                    <section className={styles.marketPanel} aria-label="Percayso / CAP"><div className={styles.marketTitle}><span className={`${styles.sourceDot} ${styles.capDot}`} /><h3>Percayso / CAP</h3></div><div className={styles.metricGrid}>
                      <KPI title="Retail" value={formatAdvertMoney(displayedValuation["Percayso Retail"], "Not available")} />
                      <KPI title="Trade" value={formatAdvertMoney(displayedValuation["Percayso Trade"], "Not available")} />
                      <KPI title="Independent" value={formatAdvertMoney(displayedValuation["Percayso Independent"], "Not available")} />
                      <KPI title="Franchise" value={formatAdvertMoney(displayedValuation["Percayso Franchise"], "Not available")} />
                      <KPI title="Days To Sale" value={displayedValuation["Percayso Days To Sale"] ?? "—"} />
                    </div></section>
                  </div>
                  <section className={styles.buyingPanel} aria-label="Buying metrics">
                    <div className={styles.sectionIntro}><div><h3>Buying metrics</h3><p>Enter your offer to review the potential return.</p></div><button type="button" onClick={bookIntoStock} className={styles.secondaryButton}>Book Into Stock</button></div>
                    <label className={`${styles.field} ${styles.offerField}`}><span>Your offer price (£)</span><input type="number" placeholder="Enter an offer" value={offerPrice} onChange={e => setOfferPrice(e.target.value)} /></label>
                    <div className={styles.buyingGrid}>
                      <KPI title="Maximum Offer" value={formatAdvertMoney(displayedValuation["Suggested Offer"], "Not available")} highlight />
                      <KPI title="Target Profit" value={formatAdvertMoney(displayedValuation["Target Profit"], "Not available")} />
                      <KPI title="Days To Sale" value={displayedValuation["Percayso Days To Sale"] ?? "—"} />
                      <KPI title="Buy Decision" value={displayedValuation["Opportunity Score"] >= 90 ? "BUY" : displayedValuation["Opportunity Score"] >= 75 ? "REVIEW" : "PASS"} valueClass={displayedValuation["Opportunity Score"] >= 90 ? styles.positive : displayedValuation["Opportunity Score"] >= 75 ? styles.warning : styles.negative} />
                      <KPI title="Expected Profit" value={profit !== null ? formatAdvertMoney(profit) : "—"} />
                      <KPI title="Margin" value={margin !== null ? `${margin}%` : "—"} />
                    </div><p className={styles.estimateNote}>Potential returns are before preparation, fees and other costs.</p>
                  </section>
                </>}
                {identifiedVehicle && !displayedValuation && activeTab === "valuation" && <div className={styles.emptyState}><h2>Your bike is ready to check</h2><p>Run a retail check to load market prices and buying figures.</p></div>}

                {(displayedValuation || identifiedVehicle) && activeTab === "vehicle" && <section>
                  <div className={styles.sectionIntro}><div><span className={styles.registrationBadge}>{displayedVehicle?.registration || displayedValuation?.Registration || registration}</span><h3>{displayedVehicle?.make || displayedValuation?.Make} {displayedVehicle?.model || displayedValuation?.Model}</h3><p>{displayedVehicle?.derivative || displayedValuation?.Derivative || (!selectedHistoryRecord && derivative) || "Vehicle details"}</p></div><button type="button" onClick={bookIntoStock} className={styles.secondaryButton}>Book Into Stock</button></div>
                  <FieldGrid fields={vehicleDetailFields} />
                </section>}

                {activeTab === "vehicle-check" && <section>
                  <div className={styles.sectionIntro}><div><p className={buyingStyles.eyebrow}>HPI & MOT</p><h3 className={currentVehicleCheck?.clear === false ? styles.warning : ""}>{currentVehicleCheck?.status || "No vehicle check loaded"}</h3><p>{registration || displayedValuation?.Registration || "Search Auto Trader to load HPI and MOT markers."}</p></div>{(identifiedVehicle || displayedValuation) && <button type="button" onClick={bookIntoStock} className={styles.secondaryButton}>Book Into Stock</button>}</div>
                  {currentVehicleCheckRows.length ? <FieldGrid fields={currentVehicleCheckRows} /> : <div className={styles.inlineEmpty}>Search Auto Trader first, then the HPI and MOT status will show here.</div>}
                  {currentVehicleCheck?.reportUrl && <a className={styles.reportLink} href={`/api/autotrader/vehicle-check-report?url=${encodeURIComponent(currentVehicleCheck.reportUrl)}`} target="_blank" rel="noreferrer">Open AutoTrader vehicle check report <span aria-hidden="true">↗</span></a>}
                </section>}

                {displayedValuation && activeTab === "comparables" && <section>
                  <div className={styles.sectionIntro}><div><h3>Comparable adverts</h3><p>{displayedValuation.Make} {displayedValuation.Model} · AutoTrader adverts used for this valuation</p></div><span className={styles.sourceTag}>{displayedValuation["Comparable Count"] ?? 0} comparables</span></div>
                  <div className={styles.comparableList}>
                    {String(displayedValuation["Comparable Summary"] || "").split("\n\n").filter(Boolean).map((item:string,index:number) => {
                      const lines = item.split("\n"); const parts = retailComparableValues(lines[0] || ""); const url = getValidAdvertUrl((lines[1] || "").trim());
                      return <article key={index} className={styles.comparableRow} aria-label={`Comparable advert ${index + 1}`}>
                        <dl>{["Price","Year","Mileage","Colour","Days live"].map((label,index) => <div key={label}><dt>{label}</dt><dd>{parts[index]?.trim() || "—"}</dd></div>)}</dl>
                        {url ? <a href={url} target="_blank" rel="noreferrer" className={styles.secondaryButton}>View advert <span aria-hidden="true">↗</span></a> : <span className={styles.helperMessage}>No advert link</span>}
                      </article>;
                    })}
                    {!String(displayedValuation["Comparable Summary"] || "").trim() && <div className={styles.inlineEmpty}>No comparable advert details were stored for this valuation.</div>}
                  </div>
                </section>}
                {identifiedVehicle && !displayedValuation && activeTab === "comparables" && <div className={styles.inlineEmpty}>Run a retail check to load the adverts used for this valuation.</div>}

                {activeTab === "history" && <section>
                  <div className={styles.sectionIntro}><div><h3>Previous valuations</h3><p>Open a saved check to review its market figures and vehicle details.</p></div><span className={styles.sourceTag}>{bikeHistory.length} records found</span></div>
                  {historyLoading ? <div role="status" className={styles.inlineEmpty}>Loading previous valuations...</div> : historyError ? <div role="alert" className={styles.errorState}><p>{historyError}</p><button type="button" className={styles.secondaryButton} onClick={() => void retryHistory()}>Try again</button></div> : !bikeHistory.length ? <div className={styles.inlineEmpty}>No previous valuations yet. Run your first retail check to start a history.</div> : <table className={styles.historyTable}>
                    <caption className={styles.visuallyHidden}>Saved retail valuations</caption><thead><tr><th scope="col">Date</th><th scope="col">Bike</th><th scope="col">Retail</th><th scope="col">Margin</th><th scope="col">Score</th></tr></thead>
                    <tbody>{bikeHistory.map((record:any) => <tr key={record.id} onClick={() => viewHistoryRecord(record)}>
                      <td data-label="Date">{record["Last Checked"] || "—"}</td>
                      <td data-label="Bike"><button type="button" onClick={event => { event.stopPropagation(); viewHistoryRecord(record); }} aria-label={`View valuation for ${record.Registration}`} className={styles.historyBike}><strong>{record.Registration}</strong><span>{record.Make} {record.Model}</span></button></td>
                      <td data-label="Retail">{formatAdvertMoney(record["Market Retail"], "Not available")}</td><td data-label="Margin" className={styles.positive}>{formatAdvertMoney(record["Available Margin"], "Not available")}</td><td data-label="Score"><span className={styles.scoreBadge}>{record["Opportunity Score"] ?? "—"}</span></td>
                    </tr>)}</tbody>
                  </table>}
                </section>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
