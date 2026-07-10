"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { directionsUrl, formatDriveMinutes, formatMiles, googleMapsUrl, leadLocationStatus, leadLocationTitle, staticMapUrl } from "@/lib/location-ui";
import { combineLeadImages, customerName, formatGbp, formatLeadDate, formatMileage, safeNumber, statusBadgeClass, statusLabel } from "@/lib/website-leads";
import { WEBSITE_LEAD_STATUSES, type WebsiteLead } from "@/types/website-lead";
import type { LeadReferral } from "@/types/referral";

const valuationFields = ["valuation_status", "retail_estimate", "suggested_offer", "estimated_margin", "similar_bikes", "auto_trader_search", "valuation_notes", "Motorway output", "internal_notes", "status", "assigned_to"] as const;

type FormState = Record<typeof valuationFields[number], string>;

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
    fetch(`/api/website-leads/${params.id}/referrals`).then(async response => {
      const payload = await response.json();
      if (response.ok) setReferrals(payload.referrals ?? []);
    }).catch(() => undefined);
  }, [params.id]);

  const images = useMemo(() => lead ? lead.resolved_images ?? combineLeadImages(lead) : [], [lead]);
  const mainImage = images[selectedImage];
  const mapUrl = lead ? staticMapUrl(lead) : null;

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
    <div className="website-detail-head"><Link href="/website-leads">Back to website leads</Link><div><span className={statusBadgeClass(lead.status)}>{statusLabel(lead.status)}</span><h1>{lead.reg || "No reg"} · {[lead.make, lead.model].filter(Boolean).join(" ") || "Bike details pending"}</h1><p>{customerName(lead)} · {formatLeadDate(lead.date || lead.created_at)}</p><div className="website-actions detail-valuation-actions"><button disabled={valuing || lead.valuation_status === "processing" || !lead.reg?.trim()} onClick={() => void runValuation()}>{lead.valuation_status === "processing" ? "Valuation in progress" : valuing ? "Valuing..." : lead.retail_check_id && lead.valuation_status === "completed" ? "Re-run Valuation" : "Run Retail Check"}</button>{lead.reg?.trim() && <Link href={`/retail-check?reg=${encodeURIComponent(lead.reg)}&leadId=${lead.id}`}>Open in Retail Checker</Link>}{lead.retail_check_id && <Link href={`/admin/retail-check?recordId=${encodeURIComponent(lead.retail_check_id)}&leadId=${lead.id}`}>View Valuation</Link>}</div></div></div>
    {error && <div className="website-state error compact">{error}</div>}{success && <div className="website-state success compact">{success}</div>}
    <section className="website-detail-grid">
      <div className="website-gallery">
        <button className="website-main-image" onClick={() => mainImage && setLightboxOpen(true)}>{mainImage ? <img src={mainImage} alt="Selected lead motorcycle" onError={event => { event.currentTarget.style.display = "none"; }} /> : <span>No images available</span>}</button>
        <div className="website-image-count">{images.length ? `${selectedImage + 1} of ${images.length}` : "0 photos"}</div>
        <div className="website-thumbs">{images.map((image, index) => <button className={index === selectedImage ? "active" : ""} onClick={() => setSelectedImage(index)} key={image}><img src={image} alt={`Thumbnail ${index + 1}`} onError={event => { event.currentTarget.style.opacity = ".25"; }} /></button>)}</div>
      </div>
      <InfoCard title="Bike Details" rows={[["Registration", lead.reg], ["Make", lead.make], ["Model", lead.model], ["Year", lead.year], ["Engine", lead.engine], ["Colour", lead.colour], ["Mileage", formatMileage(lead.mileage)], ["Owners", lead.owners], ["Spare keys", lead.spare_keys], ["Condition", lead.bike_condition], ["Damage", lead.damage], ["History", lead.history], ["Service history", lead.service], ["MOT", lead.mot], ["Extras", lead.extras], ["Expected price", lead.price]]} />
      <section className="website-detail-card"><h2>Customer Details</h2><dl><Row label="First name" value={lead.fname} /><Row label="Last name" value={lead.lname} /><Row label="Full name" value={customerName(lead)} /><Row label="Email" value={lead.email} /><Row label="Phone" value={lead.phone} /><Row label="Postcode" value={lead.postcode} /><Row label="Source website" value={lead.website} /><Row label="Date received" value={formatLeadDate(lead.date || lead.created_at)} /></dl><div className="website-actions">{lead.phone && <a href={`tel:${lead.phone}`}>Call Customer</a>}{lead.email && <a href={`mailto:${lead.email}`}>Email Customer</a>}<button onClick={() => copyText(lead.phone)}>Copy Phone Number</button><button onClick={() => copyText(lead.email)}>Copy Email</button><button onClick={() => copyText(lead.postcode)}>Copy Postcode</button></div></section>
      <section className="website-detail-card location-card"><h2>Location</h2><div className="website-map-preview">{mapUrl ? <iframe title="Customer location map" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <span>{leadLocationStatus(lead)}</span>}</div><dl><Row label="Customer town" value={lead.location_town} /><Row label="Location" value={leadLocationTitle(lead)} /><Row label="Postcode" value={lead.normalised_postcode || lead.postcode} /><Row label="Approximate distance" value={lead.latitude != null ? `${formatMiles(lead.distance_from_yesmoto_miles)} from YesMoto` : "Not available"} /><Row label="Driving distance" value={formatMiles(lead.driving_distance_miles)} /><Row label="Estimated drive" value={formatDriveMinutes(lead.estimated_drive_minutes)} /><Row label="Lookup status" value={leadLocationStatus(lead)} /><Row label="Last lookup" value={formatLeadDate(lead.location_checked_at)} /></dl><div className="website-actions"><a href={googleMapsUrl(lead)} target="_blank" rel="noreferrer">View Location</a><a href={directionsUrl("YesMoto", lead)} target="_blank" rel="noreferrer">Get Directions</a><button disabled={locating} onClick={() => void refreshLocation()}>{locating ? "Resolving..." : "Refresh Location"}</button></div></section>
      <section className="website-detail-card valuation-card">
        <h2>Valuation</h2>
        <div className="valuation-grid">
          <label><span>Valuation status</span><input value={form.valuation_status} onChange={event => updateField("valuation_status", event.target.value)} /></label>
          <label><span>Retail estimate</span><input inputMode="decimal" value={form.retail_estimate} onChange={event => updateField("retail_estimate", event.target.value)} /></label>
          <label><span>Suggested offer</span><input inputMode="decimal" value={form.suggested_offer} onChange={event => updateField("suggested_offer", event.target.value)} /></label>
          <label><span>Estimated margin</span><input inputMode="decimal" value={form.estimated_margin} onChange={event => updateField("estimated_margin", event.target.value)} /></label>
          <label><span>Lead status</span><select value={form.status} onChange={event => updateField("status", event.target.value)}>{WEBSITE_LEAD_STATUSES.map(status => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label>
          <label><span>Assigned to</span><input value={form.assigned_to} onChange={event => updateField("assigned_to", event.target.value)} /></label>
          <label className="full"><span>Similar bikes</span><textarea value={form.similar_bikes} onChange={event => updateField("similar_bikes", event.target.value)} /></label>
          <label className="full"><span>AutoTrader search URL</span><input value={form.auto_trader_search} onChange={event => updateField("auto_trader_search", event.target.value)} /></label>
          <label className="full"><span>Valuation notes</span><textarea value={form.valuation_notes} onChange={event => updateField("valuation_notes", event.target.value)} /></label>
          <label className="full"><span>Motorway output</span><textarea value={form["Motorway output"]} onChange={event => updateField("Motorway output", event.target.value)} /></label>
          <label className="full"><span>Internal notes</span><textarea value={form.internal_notes} onChange={event => updateField("internal_notes", event.target.value)} /></label>
        </div>
        <div className="website-actions valuation-actions">{isUrl(form.auto_trader_search) && <a href={form.auto_trader_search} target="_blank">Open AutoTrader Search</a>}<button disabled={saving} onClick={() => saveChanges()}>{saving ? "Saving..." : "Save Changes"}</button></div>
      </section>
      <section className="website-detail-card status-actions"><h2>Status Actions</h2><div className="website-actions">{[["reviewing", "Mark Reviewing"], ["contacted", "Mark Contacted"], ["offer_made", "Mark Offer Made"], ["accepted", "Mark Accepted"], ["declined", "Mark Declined"], ["purchased", "Mark Purchased"], ["closed", "Close Lead"]].map(([status, label]) => <button disabled={saving} onClick={() => statusAction(status)} key={status}>{label}</button>)}</div><dl><Row label="Contacted" value={formatLeadDate(lead.contacted_at)} /><Row label="Offer made" value={formatLeadDate(lead.offer_made_at)} /><Row label="Purchased" value={formatLeadDate(lead.purchased_at)} /><Row label="Retail Check" value={lead.retail_check_id} /><Row label="Valuation started" value={formatLeadDate(lead.valuation_started_at)} /><Row label="Valuation completed" value={formatLeadDate(lead.valuation_completed_at)} /><Row label="Valuation error" value={lead.valuation_error} /><Row label="Market Retail" value={formatGbp(lead.retail_estimate)} /><Row label="Suggested Offer" value={formatGbp(lead.suggested_offer)} /><Row label="Estimated Margin" value={formatGbp(lead.estimated_margin)} /></dl></section>
      <ReferralHistory referrals={referrals} onUpdated={next => setReferrals(current => current.map(item => item.id === next.id ? next : item))} />
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

function InfoCard({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return <section className="website-detail-card"><h2>{title}</h2><dl>{rows.map(([label, value]) => <Row label={label} value={value} key={label} />)}</dl></section>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{value || "Not recorded"}</dd></div>;
}

function ReferralHistory({ referrals, onUpdated }: { referrals: LeadReferral[]; onUpdated: (referral: LeadReferral) => void }) {
  const [busyId, setBusyId] = useState("");
  async function update(referral: LeadReferral, outcome: string) {
    setBusyId(referral.id);
    const response = await fetch(`/api/lead-referrals/${referral.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealer_outcome: outcome, notes: referral.notes }) });
    const payload = await response.json();
    if (response.ok) onUpdated(payload.referral);
    setBusyId("");
  }
  return <section className="website-detail-card status-actions referral-history"><h2>Referral History</h2><div className="website-actions"><Link href="/website-leads">Send another referral from lead card</Link><Link href="/dealer-contacts">Dealer Contacts</Link></div>{!referrals.length ? <p>No dealer referrals recorded yet.</p> : <div className="referral-history-list">{referrals.map(referral => <article key={referral.id}><header><div><b>{referral.dealer?.dealer_name || "Dealer"}</b><span>{referral.communication_method.toUpperCase()} · {referral.referral_status} · {formatLeadDate(referral.created_at)}</span></div><select value={referral.dealer_outcome} disabled={busyId === referral.id} onChange={event => void update(referral, event.target.value)}><option>Awaiting response</option><option>Dealer interested</option><option>Dealer declined</option><option>Customer contacted</option><option>Completed</option><option>Cancelled</option></select></header><dl><Row label="Customer details" value={referral.customer_consent_confirmed ? `Included with consent: ${referral.customer_consent_source}` : "Not confirmed or not included"} /><Row label="Subject" value={referral.message_subject} /><Row label="Failure" value={referral.failure_reason} /></dl><pre>{referral.message_body}</pre></article>)}</div>}</section>;
}

function copyText(value: string | null | undefined) {
  if (value) void navigator.clipboard.writeText(value);
}

function isUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}
