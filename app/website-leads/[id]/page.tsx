"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { normaliseVehicleCheck } from "@/lib/autotrader-vehicle-check";
import { directionsUrl, formatDriveMinutes, formatMiles, googleMapsUrl, leadLocationStatus, leadLocationTitle, staticMapUrl } from "@/lib/location-ui";
import { combineLeadImages, customerName, formatGbp, formatLeadDate, formatMileage, safeNumber, statusBadgeClass, statusLabel } from "@/lib/website-leads";
import { WEBSITE_LEAD_STATUSES, type WebsiteLead } from "@/types/website-lead";
import type { LeadReferral } from "@/types/referral";

const valuationFields = ["valuation_status", "retail_estimate", "suggested_offer", "estimated_margin", "similar_bikes", "auto_trader_search", "valuation_notes", "Motorway output", "internal_notes", "status", "assigned_to"] as const;
const viewedLeadIdsKey = "dealer-os.website-leads.viewed-ids";

type FormState = Record<typeof valuationFields[number], string>;
type DetailTab = "bike" | "customer" | "valuation" | "vehicle" | "status" | "referrals";
type VehicleCheckStatus = "clear" | "warning" | "unknown";

const detailTabs: [DetailTab, string][] = [
  ["bike", "Bike"],
  ["customer", "Customer"],
  ["valuation", "Valuation"],
  ["vehicle", "Vehicle Check"],
  ["status", "Status"],
  ["referrals", "Referrals"],
];

export default function WebsiteLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const [lead, setLead] = useState<WebsiteLead | null>(null);
  const [form, setForm] = useState<FormState>(() => Object.fromEntries(valuationFields.map(field => [field, ""])) as FormState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [valuing, setValuing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [referrals, setReferrals] = useState<LeadReferral[]>([]);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("bike");

  useEffect(() => {
    let active = true;
    fetch(`/api/website-leads/${params.id}`).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load website lead.");
      if (active) {
        setLead(payload.lead);
        setForm(formFromLead(payload.lead));
      }
    }).catch((fetchError: Error) => active && setError(fetchError.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [params.id]);

  useEffect(() => {
    markLeadViewed(Number(params.id));
  }, [params.id]);

  useEffect(() => {
    fetch(`/api/website-leads/${params.id}/referrals`).then(async response => {
      const payload = await response.json();
      if (response.ok) setReferrals(payload.referrals ?? []);
    }).catch(() => undefined);
  }, [params.id]);

  const images = useMemo(() => lead ? lead.resolved_images ?? combineLeadImages(lead) : [], [lead]);
  const mainImage = images[selectedImage];
  const mapUrl = lead ? staticMapUrl(lead) : null;
  const vehicleCheck = useMemo(() => lead ? websiteLeadVehicleCheck(lead) : null, [lead]);

  useEffect(() => {
    if (!lightboxOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft") setSelectedImage(index => (index - 1 + images.length) % images.length);
      if (event.key === "ArrowRight") setSelectedImage(index => (index + 1) % images.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [images.length, lightboxOpen]);

  useEffect(() => {
    if (!lead || locating || lead.latitude != null || !lead.postcode || lead.location_checked_at) return;
    void refreshLocation(false);
  }, [lead, locating]);

  function updateField(field: keyof FormState, value: string) {
    setForm(current => {
      const next = { ...current, [field]: value };
      const retail = safeNumber(next.retail_estimate);
      const offer = safeNumber(next.suggested_offer);
      const currentMargin = safeNumber(current.estimated_margin);
      const previousRetail = safeNumber(current.retail_estimate);
      const previousOffer = safeNumber(current.suggested_offer);
      const previousAutoMargin = previousRetail !== null && previousOffer !== null ? previousRetail - previousOffer : null;
      if ((field === "retail_estimate" || field === "suggested_offer") && retail !== null && offer !== null && (current.estimated_margin === "" || currentMargin === previousAutoMargin)) next.estimated_margin = String(retail - offer);
      return next;
    });
  }

  async function saveChanges(extra: Partial<FormState & { contacted_at: string; offer_made_at: string; purchased_at: string }> = {}) {
    setSaving(true);
    setError("");
    setSuccess("");
    const payload = { ...form, ...extra };
    try {
      const response = await fetch(`/api/website-leads/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save changes.");
      setLead(result.lead);
      setForm(formFromLead(result.lead));
      setSuccess("Changes saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save changes.");
    } finally {
      setSaving(false);
    }
  }

  function statusAction(status: string) {
    const now = new Date().toISOString();
    const timestamps: Record<string, Partial<FormState & { contacted_at: string; offer_made_at: string; purchased_at: string }>> = {
      contacted: { contacted_at: now },
      offer_made: { offer_made_at: now },
      purchased: { purchased_at: now },
    };
    setForm(current => ({ ...current, status }));
    void saveChanges({ status, ...(timestamps[status] ?? {}) });
  }

  async function keepForYesMoto() {
    if (!lead || !window.confirm("Keep this lead for YesMoto and remove it from any open dealer portal allocations?")) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/website-leads/${params.id}/keep-internal`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to keep lead for YesMoto.");
      setLead(payload.lead);
      setForm(formFromLead(payload.lead));
      setSuccess("Lead kept for YesMoto and removed from open dealer portal allocations.");
    } catch (keepError) {
      setError(keepError instanceof Error ? keepError.message : "Unable to keep lead for YesMoto.");
    } finally {
      setSaving(false);
    }
  }

  async function runValuation() {
    if (!lead?.reg?.trim()) {
      setError("Registration required");
      return;
    }
    if (lead.retail_check_id && lead.valuation_status === "completed" && !window.confirm("This lead already has a completed valuation. Create a second Retail Check?")) return;
    setValuing(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/website-leads/${params.id}/run-valuation`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to run valuation.");
      const refreshed = await fetch(`/api/website-leads/${params.id}`);
      const refreshedPayload = await refreshed.json();
      if (refreshed.ok) {
        setLead(refreshedPayload.lead);
        setForm(formFromLead(refreshedPayload.lead));
      }
      setSuccess(`Retail Check complete${payload.retail_check_id ? `: ${payload.retail_check_id}` : ""}.`);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run valuation.");
    } finally {
      setValuing(false);
    }
  }

  async function refreshLocation(showSuccess = true) {
    if (!lead) return;
    setLocating(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/website-leads/${params.id}/location`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postcode: lead.postcode, town: lead.location_town }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to refresh location.");
      setLead(payload.lead);
      if (showSuccess) setSuccess("Location refreshed.");
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Unable to refresh location.");
    } finally {
      setLocating(false);
    }
  }

  if (loading) return <main className="admin-page website-leads-page"><div className="website-state">Loading lead...</div></main>;
  if (error && !lead) return <main className="admin-page website-leads-page"><div className="website-state error">{error}</div></main>;
  if (!lead) return <main className="admin-page website-leads-page"><div className="website-state">Lead not found.</div></main>;

  return <main className="admin-page website-leads-page">
    <div className="website-detail-head"><Link href="/website-leads">Back to website leads</Link><div><span className={statusBadgeClass(lead.status)}>{statusLabel(lead.status)}</span><h1>{lead.reg || "No reg"} · {[lead.make, lead.model].filter(Boolean).join(" ") || "Bike details pending"}</h1><p>{customerName(lead)} · {formatLeadDate(lead.date || lead.created_at)}</p><div className="website-actions detail-valuation-actions"><button disabled={valuing || lead.valuation_status === "processing" || !lead.reg?.trim()} onClick={() => void runValuation()}>{lead.valuation_status === "processing" ? "Valuation in progress" : valuing ? "Valuing..." : lead.retail_check_id && lead.valuation_status === "completed" ? "Re-run Valuation" : "Run Retail Check"}</button><button disabled={saving || lead.status === "internal_buying"} onClick={() => void keepForYesMoto()}>{lead.status === "internal_buying" ? "Kept for YesMoto" : "Keep for YesMoto"}</button>{lead.reg?.trim() && <Link href={`/retail-check?reg=${encodeURIComponent(lead.reg)}&leadId=${lead.id}`}>Open in Retail Checker</Link>}{lead.retail_check_id && <Link href={`/admin/retail-check?recordId=${encodeURIComponent(lead.retail_check_id)}&leadId=${lead.id}`}>View Valuation</Link>}</div></div></div>
    {error && <div className="website-state error compact">{error}</div>}{success && <div className="website-state success compact">{success}</div>}
    <section className="website-detail-grid">
      <div className="website-gallery">
        <button className="website-main-image" onClick={() => mainImage && setLightboxOpen(true)}>{mainImage ? <img src={mainImage} alt="Selected lead motorcycle" onError={event => { event.currentTarget.style.display = "none"; }} /> : <span>No images available</span>}</button>
        <div className="website-image-count">{images.length ? `${selectedImage + 1} of ${images.length}` : "0 photos"}</div>
        <div className="website-thumbs">{images.map((image, index) => <button className={index === selectedImage ? "active" : ""} onClick={() => setSelectedImage(index)} key={image}><img src={image} alt={`Thumbnail ${index + 1}`} onError={event => { event.currentTarget.style.opacity = ".25"; }} /></button>)}</div>
      </div>
      <section className="website-detail-card lead-tab-card">
        <nav className="website-detail-tabs" aria-label="Lead detail sections">{detailTabs.map(([tab, label]) => <button className={activeDetailTab === tab ? "active" : ""} onClick={() => setActiveDetailTab(tab)} type="button" key={tab}>{label}</button>)}</nav>
        {activeDetailTab === "bike" && <InfoCard title="Bike Details" rows={[["Registration", lead.reg], ["Make", lead.make], ["Model", lead.model], ["Year", lead.year], ["Engine", lead.engine], ["Colour", lead.colour], ["Mileage", formatMileage(lead.mileage)], ["Owners", lead.owners], ["Spare keys", lead.spare_keys], ["Condition", lead.bike_condition], ["Damage", lead.damage], ["History", lead.history], ["Service history", lead.service], ["MOT", lead.mot], ["Extras", lead.extras], ["Expected price", lead.price]]} embedded />}
        {activeDetailTab === "customer" && <section className="lead-tab-panel"><h2>Customer Details</h2><dl><Row label="First name" value={lead.fname} /><Row label="Last name" value={lead.lname} /><Row label="Full name" value={customerName(lead)} /><Row label="Email" value={lead.email} /><Row label="Phone" value={lead.phone} /><Row label="Postcode" value={lead.postcode} /><Row label="Source website" value={lead.website} /><Row label="Date received" value={formatLeadDate(lead.date || lead.created_at)} /></dl><div className="website-actions">{lead.phone && <a href={`tel:${lead.phone}`}>Call Customer</a>}{lead.email && <a href={`mailto:${lead.email}`}>Email Customer</a>}<button onClick={() => copyText(lead.phone)}>Copy Phone Number</button><button onClick={() => copyText(lead.email)}>Copy Email</button><button onClick={() => copyText(lead.postcode)}>Copy Postcode</button></div></section>}
        {activeDetailTab === "valuation" && <section className="lead-tab-panel valuation-card"><h2>Valuation</h2><div className="valuation-grid"><label><span>Valuation status</span><input value={form.valuation_status} onChange={event => updateField("valuation_status", event.target.value)} /></label><label><span>Retail estimate</span><input inputMode="decimal" value={form.retail_estimate} onChange={event => updateField("retail_estimate", event.target.value)} /></label><label><span>Suggested offer</span><input inputMode="decimal" value={form.suggested_offer} onChange={event => updateField("suggested_offer", event.target.value)} /></label><label><span>Estimated margin</span><input inputMode="decimal" value={form.estimated_margin} onChange={event => updateField("estimated_margin", event.target.value)} /></label><label><span>Lead status</span><select value={form.status} onChange={event => updateField("status", event.target.value)}>{WEBSITE_LEAD_STATUSES.map(status => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label><label><span>Assigned to</span><input value={form.assigned_to} onChange={event => updateField("assigned_to", event.target.value)} /></label><label className="full"><span>Similar bikes</span><textarea value={form.similar_bikes} onChange={event => updateField("similar_bikes", event.target.value)} /></label><label className="full"><span>AutoTrader search URL</span><input value={form.auto_trader_search} onChange={event => updateField("auto_trader_search", event.target.value)} /></label><label className="full"><span>Valuation notes</span><textarea value={form.valuation_notes} onChange={event => updateField("valuation_notes", event.target.value)} /></label><label className="full"><span>Motorway output</span><textarea value={form["Motorway output"]} onChange={event => updateField("Motorway output", event.target.value)} /></label><label className="full"><span>Internal notes</span><textarea value={form.internal_notes} onChange={event => updateField("internal_notes", event.target.value)} /></label></div><div className="website-actions valuation-actions">{isUrl(form.auto_trader_search) && <a href={form.auto_trader_search} target="_blank">Open AutoTrader Search</a>}<button disabled={saving} onClick={() => saveChanges()}>{saving ? "Saving..." : "Save Changes"}</button></div></section>}
        {activeDetailTab === "vehicle" && <VehicleCheckPanel lead={lead} vehicleCheck={vehicleCheck} />}
        {activeDetailTab === "status" && <section className="lead-tab-panel status-actions"><h2>Status Actions</h2><div className="website-actions">{[["reviewing", "Mark Reviewing"], ["contacted", "Mark Contacted"], ["offer_made", "Mark Offer Made"], ["accepted", "Mark Accepted"], ["declined", "Mark Declined"], ["purchased", "Mark Purchased"], ["closed", "Close Lead"]].map(([status, label]) => <button disabled={saving} onClick={() => statusAction(status)} key={status}>{label}</button>)}<button disabled={saving || lead.status === "internal_buying"} onClick={() => void keepForYesMoto()}>{lead.status === "internal_buying" ? "Kept for YesMoto" : "Keep for YesMoto"}</button></div><dl><Row label="Contacted" value={formatLeadDate(lead.contacted_at)} /><Row label="Offer made" value={formatLeadDate(lead.offer_made_at)} /><Row label="Purchased" value={formatLeadDate(lead.purchased_at)} /><Row label="Retail Check" value={lead.retail_check_id} /><Row label="Valuation started" value={formatLeadDate(lead.valuation_started_at)} /><Row label="Valuation completed" value={formatLeadDate(lead.valuation_completed_at)} /><Row label="Valuation error" value={lead.valuation_error} /><Row label="Market Retail" value={formatGbp(lead.retail_estimate)} /><Row label="Suggested Offer" value={formatGbp(lead.suggested_offer)} /><Row label="Estimated Margin" value={formatGbp(lead.estimated_margin)} /></dl></section>}
        {activeDetailTab === "referrals" && <ReferralHistory referrals={referrals} onUpdated={next => setReferrals(current => current.map(item => item.id === next.id ? next : item))} embedded />}
      </section>
      <section className="website-detail-card location-card"><h2>Location</h2><div className="website-map-preview">{mapUrl ? <iframe title="Customer location map" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <span>{leadLocationStatus(lead)}</span>}</div><dl><Row label="Customer town" value={lead.location_town} /><Row label="Location" value={leadLocationTitle(lead)} /><Row label="Postcode" value={lead.normalised_postcode || lead.postcode} /><Row label="Approximate distance" value={lead.latitude != null ? `${formatMiles(lead.distance_from_yesmoto_miles)} from YesMoto` : "Not available"} /><Row label="Driving distance" value={formatMiles(lead.driving_distance_miles)} /><Row label="Estimated drive" value={formatDriveMinutes(lead.estimated_drive_minutes)} /><Row label="Lookup status" value={leadLocationStatus(lead)} /><Row label="Last lookup" value={formatLeadDate(lead.location_checked_at)} /></dl><div className="website-actions"><a href={googleMapsUrl(lead)} target="_blank" rel="noreferrer">View Location</a><a href={directionsUrl("YesMoto", lead)} target="_blank" rel="noreferrer">Get Directions</a><button disabled={locating} onClick={() => void refreshLocation()}>{locating ? "Resolving..." : "Refresh Location"}</button></div></section>
    </section>
    {lightboxOpen && <div className="website-lightbox"><button className="close" onClick={() => setLightboxOpen(false)}>Close</button><button className="previous" onClick={() => setSelectedImage((selectedImage - 1 + images.length) % images.length)}>Previous</button>{mainImage && <img src={mainImage} alt="Full screen lead motorcycle" />}<button className="next" onClick={() => setSelectedImage((selectedImage + 1) % images.length)}>Next</button><span>{selectedImage + 1} of {images.length}</span></div>}
  </main>;
}

function formFromLead(lead: WebsiteLead): FormState {
  return {
    valuation_status: lead.valuation_status ?? "pending",
    retail_estimate: lead.retail_estimate?.toString() ?? "",
    suggested_offer: lead.suggested_offer?.toString() ?? "",
    estimated_margin: lead.estimated_margin?.toString() ?? "",
    similar_bikes: lead.similar_bikes ?? "",
    auto_trader_search: lead.auto_trader_search ?? "",
    valuation_notes: lead.valuation_notes ?? "",
    "Motorway output": lead["Motorway output"] ?? "",
    internal_notes: lead.internal_notes ?? "",
    status: lead.status ?? "new",
    assigned_to: lead.assigned_to ?? "",
  };
}

function InfoCard({ title, rows, embedded = false }: { title: string; rows: [string, React.ReactNode][]; embedded?: boolean }) {
  return <section className={embedded ? "lead-tab-panel" : "website-detail-card"}><h2>{title}</h2><dl>{rows.map(([label, value]) => <Row label={label} value={value} key={label} />)}</dl></section>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{value === null || value === undefined || value === "" ? "Not recorded" : value}</dd></div>;
}

function VehicleCheckPanel({ lead, vehicleCheck }: { lead: WebsiteLead; vehicleCheck: ReturnType<typeof websiteLeadVehicleCheck> }) {
  if (!vehicleCheck) {
    return <section className="lead-tab-panel vehicle-check-admin"><header><div><h2>Vehicle Check</h2><p>No Auto Trader vehicle check has been stored for this lead yet.</p></div></header><dl><Row label="Vehicle check status" value={lead.vehicle_check_status} /><Row label="Checked at" value={formatLeadDate(lead.vehicle_check_checked_at)} /><Row label="Lookup error" value={lead.vehicle_check_error} /><Row label="Auto Trader vehicle ID" value={lead.autotrader_vehicle_id} /></dl></section>;
  }

  return <section className="lead-tab-panel vehicle-check-admin">
    <header>
      <div><h2>Vehicle Check</h2><p>{vehicleCheck.check.status}</p></div>
      {vehicleCheck.reportHref && <a href={vehicleCheck.reportHref} target="_blank" rel="noreferrer">View Auto Trader Report</a>}
    </header>
    <div className="admin-check-flags">{vehicleCheck.flags.map(flag => <article className={flag.state} key={flag.label}><b>{flag.state === "clear" ? "OK" : flag.state === "warning" ? "!" : "-"}</b><div><strong>{flag.label}</strong><span>{flag.detail}</span></div></article>)}</div>
    <dl>{vehicleCheck.rows.map(([label, value]) => <Row label={label} value={value} key={label} />)}</dl>
  </section>;
}

function ReferralHistory({ referrals, onUpdated, embedded = false }: { referrals: LeadReferral[]; onUpdated: (referral: LeadReferral) => void; embedded?: boolean }) {
  const [busyId, setBusyId] = useState("");
  async function update(referral: LeadReferral, outcome: string) {
    setBusyId(referral.id);
    const response = await fetch(`/api/lead-referrals/${referral.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealer_outcome: outcome, notes: referral.notes }) });
    const payload = await response.json();
    if (response.ok) onUpdated(payload.referral);
    setBusyId("");
  }
  return <section className={`${embedded ? "lead-tab-panel" : "website-detail-card status-actions"} referral-history`}><h2>Referral History</h2><div className="website-actions"><Link href="/website-leads">Send another referral from lead card</Link><Link href="/dealer-contacts">Dealer Contacts</Link></div>{!referrals.length ? <p>No dealer referrals recorded yet.</p> : <div className="referral-history-list">{referrals.map(referral => <article key={referral.id}><header><div><b>{referral.dealer?.dealer_name || "Dealer"}</b><span>{referral.communication_method.toUpperCase()} · {referral.referral_status} · {formatLeadDate(referral.created_at)}</span></div><select value={referral.dealer_outcome} disabled={busyId === referral.id} onChange={event => void update(referral, event.target.value)}><option>Awaiting response</option><option>Dealer interested</option><option>Dealer declined</option><option>Customer contacted</option><option>Completed</option><option>Cancelled</option></select></header><dl><Row label="Customer details" value={referral.customer_consent_confirmed ? `Included with consent: ${referral.customer_consent_source}` : "Not confirmed or not included"} /><Row label="Subject" value={referral.message_subject} /><Row label="Failure" value={referral.failure_reason} /></dl><pre>{referral.message_body}</pre></article>)}</div>}</section>;
}

function websiteLeadVehicleCheck(lead: WebsiteLead) {
  const checkData = recordValue(lead.autotrader_vehicle_check_data);
  const lookupData = recordValue(lead.autotrader_vehicle_lookup_data);
  const vehicle = recordValue(lookupData.vehicle);
  const rawCheck = checkData.check ?? lookupData.check ?? checkData.history ?? lookupData.history ?? checkData.vehicleCheck ?? lookupData.vehicleCheck ?? checkData;
  const hasCheckData = Object.keys(checkData).length > 0 || Object.keys(lookupData).length > 0 || Boolean(lead.vehicle_check_status || lead.vehicle_check_error || lead.autotrader_vehicle_id);
  if (!hasCheckData) return null;

  const check = normaliseVehicleCheck(rawCheck, {
    motExpiry: textValue(vehicle.motExpiry, vehicle.motExpiryDate, vehicle.lastMOTExpiry, lead.mot),
    previousOwners: numberValue(vehicle.previousOwners, vehicle.owners, lead.owners),
  });
  const reportUrl = check.reportUrl || textValue(checkData.reportUrl, lookupData.reportUrl, vehicle.reportUrl);
  const reportHref = reportUrl ? `/api/autotrader/vehicle-check-report?url=${encodeURIComponent(reportUrl)}` : "";
  const writeOffText = check.category ? `Category ${check.category}` : markerText(check.writtenOff, "Insurance total loss recorded", "No insurance total loss recorded", "Not returned by vehicle check");

  return {
    check,
    reportHref,
    flags: [
      checkFlag("Stolen", check.stolen, "Not recorded stolen", "Stolen marker recorded"),
      checkFlag("Finance", check.outstandingFinance, "No finance recorded", "Finance recorded"),
      { label: "Insurance write-off", state: check.writtenOff === true || check.category ? "warning" as const : check.writtenOff === false ? "clear" as const : "unknown" as const, detail: writeOffText },
      checkFlag("Mileage", check.mileageDiscrepancy, "Mileage consistent", "Mileage discrepancy recorded"),
      checkFlag("High risk", check.highRisk, "No high risk marker", "High risk marker recorded"),
      checkFlag("Scrapped", check.scrapped, "Not recorded scrapped", "Scrapped marker recorded"),
      checkFlag("Imported", check.imported, "Not recorded imported", "Import marker recorded"),
      checkFlag("Exported", check.exported, "Not recorded exported", "Export marker recorded"),
    ],
    rows: [
      ["Vehicle check status", check.status],
      ["Checked at", formatLeadDate(lead.vehicle_check_checked_at)],
      ["Registration", textValue(vehicle.registration, vehicle.vrm, lead.reg)],
      ["VIN", textValue(vehicle.vin, vehicle.vinNumber)],
      ["Engine number", textValue(vehicle.engineNumber, vehicle.engine_number)],
      ["Auto Trader vehicle ID", textValue(lead.autotrader_vehicle_id, vehicle.vehicleId, vehicle.vehicle_id, vehicle.id)],
      ["Derivative", textValue(vehicle.derivative, vehicle.derivativeName, vehicle.derivativeId, vehicle.derivative_id)],
      ["First registered", textValue(vehicle.firstRegistrationDate, vehicle.registrationDate)],
      ["MOT status", check.motStatus],
      ["MOT expiry", check.motExpiry || lead.mot],
      ["Previous owners", check.previousOwners],
      ["Write-off category", check.category || "Not recorded"],
      ["Private finance", markerText(check.privateFinance, "Recorded", "Not recorded", "Not returned")],
      ["Trade finance", markerText(check.tradeFinance, "Recorded", "Not recorded", "Not returned")],
      ["Colour changed", markerText(check.colourChanged, "Recorded", "Not recorded", "Not returned")],
      ["Plate changes", check.plateChanges == null ? "Not returned" : String(check.plateChanges)],
      ["Lookup error", lead.vehicle_check_error],
    ] as [string, React.ReactNode][],
  };
}

function checkFlag(label: string, value: boolean | null, clearText: string, warningText: string) {
  return { label, state: value === true ? "warning" as VehicleCheckStatus : value === false ? "clear" as VehicleCheckStatus : "unknown" as VehicleCheckStatus, detail: markerText(value, warningText, clearText, "Not returned by vehicle check") };
}

function markerText(value: boolean | null, trueText: string, falseText: string, unknownText: string) {
  if (value === true) return trueText;
  if (value === false) return falseText;
  return unknownText;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function copyText(value: string | null | undefined) {
  if (value) void navigator.clipboard.writeText(value);
}

function isUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}

function markLeadViewed(id: number) {
  if (!Number.isInteger(id)) return;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(viewedLeadIdsKey) ?? "[]");
    const ids = new Set(Array.isArray(parsed) ? parsed.filter((value): value is number => Number.isInteger(value)) : []);
    ids.add(id);
    window.localStorage.setItem(viewedLeadIdsKey, JSON.stringify(Array.from(ids)));
  } catch {
    window.localStorage.setItem(viewedLeadIdsKey, JSON.stringify([id]));
  }
}
