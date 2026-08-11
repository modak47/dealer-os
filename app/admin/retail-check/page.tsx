"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normaliseVehicleCheck, vehicleCheckFieldRows, type VehicleCheckSummary } from "@/lib/autotrader-vehicle-check";

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
    <div className="retail-detail-grid">
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
    <div className="bg-black border border-zinc-800 rounded-2xl p-4">
      <div className="text-zinc-500 text-xs uppercase tracking-wide">{title}</div>
      <div className={`text-2xl font-bold mt-2 ${highlight ? "text-[#00E51D]" : ""}`}>
        {value ?? "-"}
      </div>
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
    async function loadData() {
      const makesResponse = await fetch("/api/makes");
      setMakes(await makesResponse.json());

      const modelsResponse = await fetch("/api/models");
      setModels(await modelsResponse.json());
    }
    loadData();
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

  useEffect(() => {

  async function loadHistory() {

    const response =
      await fetch("/api/retail-history");

    const data =
      await response.json();

    setHistoryRecords(data);

  }

  loadHistory();

}, []);

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
      if (vehicle.vehicleCheck) setActiveTab("vehicle-check");
      setLookupMessage(vehicle.derivativeId ? "Auto Trader derivative matched." : "Vehicle found. No derivative ID returned; you can continue manually.");
    } catch (caught) {
      setIdentifiedVehicle(null);
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

  const storedMotData = displayedValuation?.["Auto Trader MOT Data"];
  const storedMotObject = storedMotData && typeof storedMotData === "object" && !Array.isArray(storedMotData) ? storedMotData as Record<string, unknown> : null;
  const currentVehicleCheck = identifiedVehicle?.vehicleCheck ?? (storedMotObject && Object.keys(storedMotObject).length ? normaliseVehicleCheck(storedMotObject.check ?? storedMotObject.history ?? storedMotObject, { motExpiry: identifiedVehicle?.motExpiry, previousOwners: identifiedVehicle?.previousOwners }) : null);
  const currentVehicleCheckRows = vehicleCheckFieldRows(currentVehicleCheck);
  const vehicleDetailFields = [
    { label: "Registration", value: identifiedVehicle?.registration || displayedValuation?.Registration || registration },
    { label: "VIN", value: identifiedVehicle?.vin },
    { label: "Engine number", value: identifiedVehicle?.engineNumber },
    { label: "Make", value: identifiedVehicle?.make || displayedValuation?.Make || selectedMake },
    { label: "Model", value: identifiedVehicle?.model || displayedValuation?.Model || selectedModel },
    { label: "Derivative", value: identifiedVehicle?.derivative || derivative || displayedValuation?.Derivative },
    { label: "Derivative ID", value: identifiedVehicle?.derivativeId || derivativeId || displayedValuation?.["Derivative ID"] },
    { label: "AutoTrader vehicle ID", value: identifiedVehicle?.vehicleId || displayedValuation?.["Auto Trader Vehicle ID"] },
    { label: "Year", value: identifiedVehicle?.year || displayedValuation?.Year || year },
    { label: "Mileage", value: identifiedVehicle?.mileage || displayedValuation?.Mileage || mileage },
    { label: "First registered", value: identifiedVehicle?.firstRegistrationDate },
    { label: "Previous owners", value: identifiedVehicle?.previousOwners || currentVehicleCheck?.previousOwners },
    { label: "Colour", value: identifiedVehicle?.colour },
    { label: "Body type", value: identifiedVehicle?.bodyType },
    { label: "Fuel", value: identifiedVehicle?.fuelType },
    { label: "Transmission", value: identifiedVehicle?.transmission },
    { label: "Engine", value: identifiedVehicle?.engineSize ? `${identifiedVehicle.engineSize}cc` : "" },
    { label: "BHP", value: identifiedVehicle?.power },
    { label: "PS", value: identifiedVehicle?.powerPs },
    { label: "Torque", value: identifiedVehicle?.torque },
    { label: "CO2", value: identifiedVehicle?.co2 },
    { label: "Road tax", value: identifiedVehicle?.roadTax },
    { label: "Top speed", value: identifiedVehicle?.topSpeed },
    { label: "Gears", value: identifiedVehicle?.gears },
    { label: "Length", value: identifiedVehicle?.lengthMm },
    { label: "Width", value: identifiedVehicle?.widthMm },
    { label: "Weight", value: identifiedVehicle?.weightKg },
    { label: "Euro emissions", value: identifiedVehicle?.euroEmissions },
    { label: "MOT expiry", value: identifiedVehicle?.motExpiry || currentVehicleCheck?.motExpiry },
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
    const vehicle = identifiedVehicle ?? {
      registration,
      make: selectedMake,
      model: selectedModel,
      derivative,
      derivativeId,
      year: year ? Number(year) : undefined,
      mileage: mileage ? Number(mileage) : undefined,
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
        variant: String(vehicle.derivative || derivative || ""),
        derivative_id: String(vehicle.derivativeId || derivativeId || ""),
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
    router.push(`/admin/stock/book-in?fromRetailCheck=${encodeURIComponent(String(recordId || requestId || registration || "lookup"))}`);
  }

  const marketRetail =
  Number(displayedValuation?.["Market Retail"]) || 0;

  const hasOfferPrice =
    offerPrice !== "";

  const profit =
    hasOfferPrice
      ? marketRetail - Number(offerPrice)
      : null;

  const margin =
    hasOfferPrice && marketRetail > 0
      ? ((profit! / marketRetail) * 100).toFixed(1)
      : null;

  const bikeHistory =
  historyRecords.sort(
    (a: any, b: any) =>
      new Date(b.createdTime).getTime() -
      new Date(a.createdTime).getTime()
  );

  return (
    <main className="dealer-module retail-check-page min-h-screen text-white">
      <div className="mx-auto max-w-[1500px] p-4 md:p-8">
        <div className="mb-6">
          <h1 className="text-4xl font-bold">Retail Checker</h1>
          <p className="text-zinc-400">AutoTrader / CAP Dealer Dashboard</p>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <aside className="col-span-12 lg:col-span-3 bg-[#151515] border border-zinc-800 rounded-3xl p-6 h-fit lg:sticky lg:top-6">
            <h2 className="font-bold text-xl mb-5">Bike Details</h2>

            <div className="space-y-4 mb-4">


              <input
                type="text"
                placeholder="Registration"
                value={registration}
                onChange={(e) =>
                  setRegistration(
                    e.target.value.toUpperCase()
                  )
                }
                className="flex-1 p-4 rounded-xl bg-black border border-zinc-700"
              />
              <button
                type="button"
                onClick={() => void lookupRegistration()}
                disabled={lookupLoading || !registration.trim()}
                className="w-full bg-zinc-900 border border-zinc-700 text-white font-bold py-3 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {lookupLoading ? "Searching Auto Trader..." : "Search Auto Trader"}
              </button>

              <input
                type="number"
                placeholder="Mileage"
                value={mileage}
                onChange={(e)=>setMileage(e.target.value)}
                className="w-full p-4 rounded-xl bg-black border border-zinc-700"
              />

            </div>

                {identifiedVehicle && (
              <div className="bg-black border border-zinc-800 rounded-xl p-4 mb-4">
                <div className="font-bold text-white">
                  {[identifiedVehicle.year, identifiedVehicle.make, identifiedVehicle.model, identifiedVehicle.derivative].filter(Boolean).join(" ")}
                </div>
                <div className="text-zinc-400 text-sm mt-1">
                  {identifiedVehicle.registration || registration}
                </div>
                <div className="text-zinc-500 text-xs mt-2">
                  {[identifiedVehicle.engineSize ? `${identifiedVehicle.engineSize}cc` : "", identifiedVehicle.transmission, identifiedVehicle.fuelType].filter(Boolean).join(" / ")}
                </div>
                {identifiedVehicle.motExpiry && <div className="text-zinc-500 text-xs mt-1">MOT expires {identifiedVehicle.motExpiry}</div>}
                {identifiedVehicle.vehicleCheck && <div className={identifiedVehicle.vehicleCheck.clear === false ? "text-red-300 text-xs font-bold uppercase tracking-wide mt-3" : "text-[#00E51D] text-xs font-bold uppercase tracking-wide mt-3"}>Vehicle check: {identifiedVehicle.vehicleCheck.status}</div>}
                {identifiedVehicle.derivativeId && <div className="text-[#00E51D] text-xs font-bold uppercase tracking-wide mt-3">Derivative matched</div>}
                <button type="button" onClick={bookIntoStock} className="mt-4 w-full bg-zinc-900 border border-[#00E51D] text-[#00E51D] font-bold py-3 rounded-xl">
                  Book Into Stock
                </button>
              </div>
            )}

            {lookupMessage && (
              <div className="text-zinc-400 text-sm mb-4">
                {lookupMessage}
              </div>
            )}

            {derivative && (
              <div className="text-green-400 text-sm mt-2">
                {derivative}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowManualSearch(!showManualSearch)}
              className="text-zinc-400 text-sm hover:text-white mb-4"
            >
              {showManualSearch
                ? "Hide Manual Search ▲"
                : "Manual Search ▼"}
            </button>

            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">

                <select
                  value={selectedMake}
                  onChange={(e)=>{
                    setSelectedMake(e.target.value);
                    setSelectedModel("");
                  }}
                  className="w-full p-4 rounded-xl bg-black border border-zinc-700"
                >
                  <option>Select Make</option>

                  {makes
                    .filter((m:any)=>m?.make)
                    .sort((a:any,b:any)=>
                      String(a.make).localeCompare(String(b.make))
                    )
                    .map((m:any)=>(
                      <option key={m.make} value={m.make}>
                        {m.make}
                      </option>
                    ))}
                </select>

                <select
                  value={selectedModel}
                  onChange={(e)=>setSelectedModel(e.target.value)}
                  className="w-full p-4 rounded-xl bg-black border border-zinc-700"
                >
                  <option>Select Model</option>

                  {filteredModels.map((m:any)=>(
                    <option
                      key={`${m.make}-${m.model}`}
                      value={m.model}
                    >
                      {m.model}
                    </option>
                  ))}
                </select>

              </div>

              <div className="grid grid-cols-2 gap-3">

                <input
                  type="number"
                  placeholder="Year"
                  value={year}
                  onChange={(e)=>setYear(e.target.value)}
                  className="w-full p-4 rounded-xl bg-black border border-zinc-700"
                />

                <input
                  type="number"
                  placeholder="Mileage"
                  value={mileage}
                  onChange={(e)=>setMileage(e.target.value)}
                  className="w-full p-4 rounded-xl bg-black border border-zinc-700"
                />

              </div>
              

              <button onClick={checkMarket} disabled={runButtonDisabled} className="w-full bg-[#00E51D] text-black font-bold py-4 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? "Starting Check..." : activeCheckRunning ? "Valuation Running..." : "Run Retail Check"}
              </button>

             {submitError && (
              <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-200 text-sm">
                {submitError}
              </div>
             )}

             {(status || valuation) && (
              <div className="bg-black border border-zinc-800 rounded-xl p-4">

                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <div className="font-semibold text-white">
                      {valuation?.Status || status}
                    </div>
                    <div className="text-zinc-500 text-xs">
                      {valuation?.Registration || registration}
                    </div>
                  </div>
                  {elapsed && (
                    <div className="text-zinc-500 text-xs">
                      {elapsed}
                    </div>
                  )}
                </div>

                <div className="text-[#00E51D] text-xs font-bold uppercase tracking-wide mb-2">
                  {valuation?.["Progress Stage"] || "Queued"}
                </div>

                <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`bg-[#00E51D] h-2 ${terminalStatuses.has(String(valuation?.Status)) ? "" : "animate-pulse"}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="text-zinc-400 text-sm mt-3">
                  {progressMessage || "Waiting for market analysis..."}
                </div>

                {valuation?.Status === "Failed" && (
                  <button type="button" onClick={retryCurrentCheck} disabled={loading} className="mt-4 w-full bg-[#00E51D] text-black font-bold py-3 rounded-xl">
                    {loading ? "Retrying..." : "Retry Retail Check"}
                  </button>
                )}

              </div>
            )}
            </div>
          </aside>

          <section className="col-span-12 lg:col-span-9">
            {valuation && (
              <div className="bg-[#151515] border border-zinc-800 rounded-3xl p-6 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-bold">
                      {displayedValuation.Make} {displayedValuation.Model}
                    </h2>

                    <p className="text-zinc-400">
                      {displayedValuation.Year} • {displayedValuation.Mileage} miles
                    </p>
                  </div>

                  <div className="bg-black border border-[#00E51D] rounded-2xl px-6 py-4">
                    <div className="text-zinc-400 text-sm">Buy Decision</div>
                    <div className="text-3xl font-bold text-[#00E51D]">
                      {displayedValuation["Buy Decision"]}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-[#151515] border border-zinc-800 rounded-3xl overflow-hidden">
              <div className="flex border-b border-zinc-800">
                {["vehicle","vehicle-check","valuation","comparables","history"].map(tab=>(
                  <button
                    key={tab}
                    onClick={()=>setActiveTab(tab)}
                    className={`px-6 py-4 capitalize font-semibold ${activeTab===tab ? "text-[#00E51D] border-b-2 border-[#00E51D]" : "text-zinc-400"}`}
                  >
                    {tab.replace("-", " ")}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {!valuation && activeTab !== "history" && (
                  <div className="text-zinc-400">
                    
                  </div>
                )}

                {displayedValuation && activeTab==="valuation" && (
                  <>


                  {selectedHistoryRecord && (

                    <button
                      onClick={() =>
                        setSelectedHistoryRecord(null)
                      }
                      className="
                        mb-4
                        bg-[#00E51D]
                        text-black
                        px-4
                        py-2
                        rounded-lg
                        font-bold
                      "
                    >

                      Return To Current Valuation

                    </button>

                  )}
                    <div className="grid lg:grid-cols-2 gap-6 mb-6">

                      <div className="bg-black border border-zinc-800 rounded-2xl p-5">
                        <h3 className="text-xl font-bold mb-4 text-[#00E51D]">
                          AutoTrader Market
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                          <KPI
                            title="Market Retail"
                            value={`£${displayedValuation["Market Retail"] || 0}`}
                          />

                          <KPI
                            title="Fast Sale"
                            value={`£${displayedValuation["Fast Sale Retail"] || 0}`}
                          />

                          <KPI
                            title="Premium Retail"
                            value={`£${displayedValuation["Premium Retail"] || 0}`}
                          />

                          <KPI
                            title="Comparables"
                            value={displayedValuation["Comparable Count"] || 0}
                          />

                          <KPI
                            title="Confidence"
                            value={displayedValuation["Confidence"] || "-"}
                          />

                          <KPI
                            title="Opportunity Score"
                            value={displayedValuation["Opportunity Score"] || 0}
                          />
                        </div>
                      </div>

                      <div className="bg-black border border-zinc-800 rounded-2xl p-5">
                        <h3 className="text-xl font-bold mb-4 text-blue-400">
                          Percayso / CAP
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                          <KPI
                            title="Retail"
                            value={`£${displayedValuation["Percayso Retail"] || 0}`}
                          />

                          <KPI
                            title="Trade"
                            value={`£${displayedValuation["Percayso Trade"] || 0}`}
                          />

                          <KPI
                            title="Independent"
                            value={`£${displayedValuation["Percayso Independent"] || 0}`}
                          />

                          <KPI
                            title="Franchise"
                            value={`£${displayedValuation["Percayso Franchise"] || 0}`}
                          />

                          <KPI
                            title="Days To Sale"
                            value={displayedValuation["Percayso Days To Sale"] || "-"}
                          />

                        </div>
                      </div>

                    </div>

                    <div className="bg-black border border-zinc-800 rounded-2xl p-5">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                        <h3 className="text-xl font-bold">
                          Buying Metrics
                        </h3>
                        <button type="button" onClick={bookIntoStock} className="bg-[#00E51D] text-black px-4 py-3 rounded-xl font-bold">
                          Book Into Stock
                        </button>
                      </div>

                      <div className="mb-4">
                        <input
                          type="number"
                          placeholder="Offer Price"
                          value={offerPrice}
                          onChange={(e) => setOfferPrice(e.target.value)}
                          className="w-full p-4 rounded-xl bg-[#111] border border-zinc-700"
                        />
                      </div>

                      <div className="grid md:grid-cols-6 gap-4">
                        <KPI
                          title="Maximum Offer"
                          value={`£${displayedValuation["Suggested Offer"] || 0}`}
                          highlight
                        />

                        <KPI
                          title="Target Profit"
                          value={`£${displayedValuation["Target Profit"] || 0}`}
                          highlight
                        />

                        <KPI
                          title="Days To Sale"
                          value={displayedValuation["Percayso Days To Sale"] || "-"}
                        />

                        <KPI
                          title="Buy Decision"
                          value={
                            displayedValuation["Opportunity Score"] >= 90
                              ? "BUY"
                              : displayedValuation["Opportunity Score"] >= 75
                              ? "REVIEW"
                              : "PASS"

                          }

                          valueClass={
                            displayedValuation["Opportunity Score"] >= 90
                              ? "text-green-400"
                              : displayedValuation["Opportunity Score"] >= 75
                              ? "text-yellow-400"
                              : "text-red-400"
                          }    
                        />

                       <KPI
                          title="Expected Profit"
                          value={
                            profit !== null
                              ? `£${profit.toLocaleString()}`
                              : "-"
                          }
                        />

                        <KPI
                          title="Margin"
                          value={
                            margin !== null
                              ? `${margin}%`
                              : "-"
                          }
                        /> 
                      </div>
                    </div>

                    
                  </>
                )}

                {displayedValuation && activeTab==="vehicle" && (
                  <div className="rounded-2xl border border-zinc-800 bg-black p-5">
                    <div className="retail-tab-header">
                      <div>
                        <div className="retail-reg">{displayedValuation.Registration}</div>
                        <h3>{displayedValuation.Make} {displayedValuation.Model}</h3>
                        <p>{identifiedVehicle?.derivative || derivative || displayedValuation.Derivative || "Vehicle details"}</p>
                      </div>
                      <button type="button" onClick={bookIntoStock}>Book Into Stock</button>
                    </div>
                    <FieldGrid fields={vehicleDetailFields} />
                  </div>
                )}
                {activeTab==="vehicle-check" && (
                  <div className="rounded-2xl border border-zinc-800 bg-black p-5">
                    <div className="retail-tab-header">
                      <div>
                        <div className={currentVehicleCheck?.clear === false ? "retail-check-status danger" : "retail-check-status"}>
                          {currentVehicleCheck?.status || "No vehicle check loaded"}
                        </div>
                        <p>
                          {registration || displayedValuation?.Registration || "Search Auto Trader to load HPI and MOT markers."}
                        </p>
                      </div>
                      {(identifiedVehicle || displayedValuation) && (
                        <button type="button" onClick={bookIntoStock}>
                          Book Into Stock
                        </button>
                      )}
                    </div>
                    {currentVehicleCheckRows.length > 0 ? (
                      <FieldGrid fields={currentVehicleCheckRows} />
                    ) : (
                      <div className="text-zinc-400">Search Auto Trader first, then the HPI and MOT status will show here.</div>
                    )}
                    {currentVehicleCheck?.reportUrl && <a className="retail-report-link" href={`/api/autotrader/vehicle-check-report?url=${encodeURIComponent(currentVehicleCheck.reportUrl)}`} target="_blank" rel="noreferrer">Open AutoTrader vehicle check report</a>}
                  </div>
                )}
                {displayedValuation && activeTab==="comparables" && (
                  <>
                    <div className="mb-4">
                      <h3 className="text-2xl font-bold">
                        {displayedValuation.Make} {displayedValuation.Model}
                      </h3>

                      <p className="text-zinc-400">
                        Comparable AutoTrader adverts used for valuation
                      </p>
                    </div>

                    <div className="flex items-center gap-6 px-4 py-2 text-xs uppercase text-zinc-500 border-b border-zinc-800 mb-2">
                      <div className="w-24">Price</div>
                      <div className="w-16">Year</div>
                      <div className="w-32">Mileage</div>
                      <div className="w-24">Colour</div>
                      <div className="w-16">DOM</div>
                      <div className="w-20">Link</div>
                    </div>


                    <div className="space-y-3">
                      {String(displayedValuation["Comparable Summary"] || "")
                        .split("\n\n")
                        .filter(Boolean)
                        .map((item:string,index:number) => {

                          const lines = item.split("\n");
                          const details = lines[0] || "";
                          const url = lines[1] || "";

                          const parts = details.split("|");

                          const price = parts[0]?.trim() || "";
                          const year = parts[1]?.trim() || "";
                          const mileage = parts[2]?.trim() || "";
                          const colour = parts[3]?.trim() || "";
                          const dom = parts[4]?.trim() || "";

                          return (
                            <div
                              key={index}
                              className="bg-black border-b border-zinc-800 px-4 py-3"
                            >
                              <div className="flex items-center gap-6">

                                <div className="w-24 font-bold text-green-400">
                                  {price}
                                </div>

                                <div className="w-16">
                                  {year}
                                </div>

                                <div className="w-32">
                                  {mileage}
                                </div>

                                <div className="w-24">
                                  {colour || "-"}
                                </div>

                                <div className="w-16">
                                  {dom}
                                </div>

                                <div className="w-20">
                                  {url && (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[#00E51D] hover:underline"
                                    >
                                      View →
                                    </a>
                                  )}
                                </div>

                              </div>
                            </div>
                          ); 
                        })}
                    </div>
                
                  </>
                )}

                {activeTab==="history" && (


                

  <div className="space-y-4">

    <div className="flex items-center justify-between">
      <h3 className="text-xl font-bold">
        Previous Valuations
      </h3>

      <div className="text-sm text-zinc-400">
        {bikeHistory.length} records found
      </div>
    </div>

    <div className="overflow-hidden rounded-2xl border border-zinc-800">

      <table className="w-full">

        <thead>

          <tr className="bg-black">

            <th className="text-left p-4">
              Date
            </th>

              <th className="text-left p-4">
                Bike
              </th>

            <th className="text-left p-4">
              Retail
            </th>

            <th className="text-left p-4">
              Margin
            </th>

            <th className="text-left p-4">
              Score
            </th>

          </tr>

        </thead>

        <tbody>

          {bikeHistory.map((record: any) => (

            <tr
              key={record.id}
              onClick={() => {

                setSelectedHistoryRecord(
                  record
                );

                setActiveTab(
                  "valuation"
                );

              }}
              className="
                border-t
                border-zinc-800
                cursor-pointer
                hover:bg-zinc-900
              "
            >

              <td className="p-4">
                {record["Last Checked"]}
              </td>

              <td className="p-4">

                <div className="font-semibold">
                  {record.Registration}
                </div>

                <div className="text-zinc-300">
                  {record.Make}
                </div>

                <div className="text-zinc-500 text-sm">
                  {record.Model}
                </div>

              </td>

              <td className="p-4">
                £{record["Market Retail"]}
              </td>

              <td className="p-4 text-[#00E51D]">
                £{record["Available Margin"]}
              </td>

              <td className="p-4">
                {record["Opportunity Score"]}
              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  </div>
)}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
