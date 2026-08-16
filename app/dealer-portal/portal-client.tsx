"use client";

import { useEffect, useMemo, useState } from "react";
import { combineLeadImages, customerName, formatGbp, formatLeadDate, formatMileage, statusLabel } from "@/lib/website-leads";
import type { DealerPortalAccount, DealerVisibleLead } from "@/types/dealer-portal";

type PortalData = {
  dealer: DealerPortalAccount;
  available: DealerVisibleLead[];
  claimed: DealerVisibleLead[];
};

export function DealerPortalClient() {
  const [data, setData] = useState<PortalData | null>(null);
  const [activeTab, setActiveTab] = useState<"available" | "claimed">("available");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/dealer-portal/leads", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setData(payload);
    else setError(payload.error || "Unable to load dealer portal.");
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const leads = activeTab === "available" ? data?.available ?? [] : data?.claimed ?? [];
  const kpis = useMemo(() => [
    ["Available", data?.available.length ?? 0],
    ["Active", data?.claimed.filter(lead => !["purchased", "lost", "returned_to_pool", "purchased_later"].includes(String(lead.portal_claim_status))).length ?? 0],
    ["Purchased", data?.claimed.filter(lead => ["purchased", "purchased_later"].includes(String(lead.portal_claim_status))).length ?? 0],
    ["Purchase Fee", formatGbp(data?.dealer.successful_purchase_fee ?? 50)],
  ], [data]);

  async function claim(lead: DealerVisibleLead) {
    setBusyId(lead.id);
    setError("");
    setNotice("");
    const response = await fetch(`/api/dealer-portal/leads/${lead.id}/claim`, { method: "POST" });
    const payload = await response.json();
    if (response.ok) {
      setNotice("Lead claimed. Customer details are now unlocked.");
      setActiveTab("claimed");
      await load();
    } else setError(payload.error || "Unable to claim lead.");
    setBusyId(null);
  }

  return <main className="dealer-portal">
    <section className="dealer-portal-head"><div><p>DEALER BUYING PORTAL</p><h1>{data?.dealer.trading_name || "Motorcycle opportunities"}</h1><span>Claiming and contacting are free. A successful purchase fee is only due when you buy the motorcycle.</span></div></section>
    {error && <div className="portal-message error">{error}</div>}{notice && <div className="portal-message">{notice}</div>}
    {loading ? <div className="portal-empty"><h2>Loading portal...</h2></div> : !data ? <div className="portal-empty"><h2>Dealer access unavailable</h2><p>Your signed-in user is not linked to an active dealer portal account yet.</p></div> : <section className="dealer-portal-dashboard">
      <div className="portal-kpis">{kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <nav className="portal-tabs" aria-label="Dealer lead sections"><button className={activeTab === "available" ? "active" : ""} onClick={() => setActiveTab("available")}>Available Leads</button><button className={activeTab === "claimed" ? "active" : ""} onClick={() => setActiveTab("claimed")}>Active Leads</button></nav>
      {!leads.length ? <div className="portal-empty"><h2>{activeTab === "available" ? "No available motorcycles right now" : "No claimed motorcycles yet"}</h2><p>{activeTab === "available" ? "New suitable opportunities will appear here when YesMoto releases them." : "Claim a lead to unlock customer details and work the opportunity."}</p></div> : <section className="dealer-lead-grid">{leads.map(lead => <DealerLeadCard lead={lead} busy={busyId === lead.id} onClaim={() => void claim(lead)} key={`${activeTab}-${lead.id}`} />)}</section>}
    </section>}
  </main>;
}

function DealerLeadCard({ lead, busy, onClaim }: { lead: DealerVisibleLead; busy: boolean; onClaim: () => void }) {
  const images = lead.resolved_images ?? combineLeadImages(lead);
  const image = images[0];
  const unlocked = Boolean(lead.customer_unlocked);
  return <article className="dealer-lead-card">
    <div className="dealer-lead-image">{image ? <img src={image} alt={`${lead.make ?? "Motorcycle"} ${lead.model ?? ""}`} /> : <span>No photos</span>}{images.length > 1 && <b>{images.length} photos</b>}</div>
    <div className="dealer-lead-body">
      <header><span>{statusLabel(lead.portal_claim_status || lead.status || "available")}</span><h2>{[lead.year, lead.make, lead.model].filter(Boolean).join(" ") || "Motorcycle details pending"}</h2><p>{lead.reg || "Registration not shown"} · {formatMileage(lead.mileage)} · {lead.engine || "Engine n/a"}</p></header>
      <dl>
        <div><dt>Location</dt><dd>{lead.location_town || lead.postcode || "Approximate location pending"}</dd></div>
        <div><dt>Expected price</dt><dd>{lead.price || "Not supplied"}</dd></div>
        <div><dt>Colour</dt><dd>{lead.colour || "Not supplied"}</dd></div>
        <div><dt>MOT</dt><dd>{lead.mot || "Not supplied"}</dd></div>
        <div><dt>Condition</dt><dd>{lead.bike_condition || lead.damage || "Not supplied"}</dd></div>
        <div><dt>Received</dt><dd>{formatLeadDate(lead.date || lead.created_at)}</dd></div>
      </dl>
      <section className={`dealer-customer-panel ${unlocked ? "unlocked" : ""}`}>
        <h3>{unlocked ? "Customer Details" : "Customer Details Locked"}</h3>
        {unlocked ? <dl><div><dt>Name</dt><dd>{customerName(lead)}</dd></div><div><dt>Phone</dt><dd>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : "Not supplied"}</dd></div><div><dt>Email</dt><dd>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : "Not supplied"}</dd></div><div><dt>Postcode</dt><dd>{lead.postcode || "Not supplied"}</dd></div></dl> : <p>Claim this lead to unlock customer contact details. Only one dealer can claim each lead.</p>}
      </section>
      {!unlocked && <button className="dealer-claim-button" disabled={busy} onClick={onClaim}>{busy ? "Claiming..." : "Claim Lead"}</button>}
    </div>
  </article>;
}
