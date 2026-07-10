"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatGbp, formatLeadDate, statusLabel } from "@/lib/website-leads";
import type { WebsiteLead } from "@/types/website-lead";

type WebsiteLeadSummary = {
  total: number;
  new: number;
  pendingValuations: number;
  receivedToday: number;
  receivedThisWeek: number;
  purchasedThisMonth: number;
  sourceCounts: Record<"bikebuyeruk" | "sellyourmotorbike" | "motorcyclebuyer", number>;
  latestLeads: WebsiteLead[];
};

export function WebsiteLeadsOverview() {
  const [summary, setSummary] = useState<WebsiteLeadSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/website-leads?summary=true&limit=5").then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load Website Leads.");
      if (active) setSummary(payload.summary);
    }).catch((caught: Error) => active && setError(caught.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  if (loading) return <section className="overview-website-leads"><div className="panel-title"><h2>WEBSITE LEADS</h2><Link href="/website-leads">View all</Link></div><div className="overview-website-skeleton"><i /><i /><i /><i /></div></section>;
  if (error) return <section className="overview-website-leads"><div className="panel-title"><h2>WEBSITE LEADS</h2><Link href="/website-leads">View all</Link></div><div className="overview-website-state error">{error}</div></section>;
  if (!summary) return null;

  const kpis = [["New Leads", summary.new], ["Pending Valuations", summary.pendingValuations], ["Received Today", summary.receivedToday], ["This Week", summary.receivedThisWeek], ["Purchased This Month", summary.purchasedThisMonth], ["Total Website Leads", summary.total]];
  const sourceCounts = [["Bike Buyer UK", summary.sourceCounts.bikebuyeruk], ["Sell Your Motorbike", summary.sourceCounts.sellyourmotorbike], ["Motorcycle Buyer", summary.sourceCounts.motorcyclebuyer]];

  return <section className="overview-website-leads">
    <div className="panel-title"><h2>WEBSITE LEADS</h2><Link href="/website-leads">View All Website Leads</Link></div>
    <div className="overview-website-grid">
      <div className="overview-website-kpis">{kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <div className="overview-source-counts">{sourceCounts.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
    </div>
    {!summary.latestLeads.length ? <div className="overview-website-state">No website leads yet.</div> : <div className="overview-latest-leads">{summary.latestLeads.map(lead => <Link href={`/website-leads/${lead.id}`} key={lead.id}>
      <span className="overview-lead-thumb">{lead.resolved_images?.[0] ? <img src={lead.resolved_images[0]} alt="" /> : <i />}</span>
      <b>{lead.reg || "No reg"}<small>{[lead.make, lead.model].filter(Boolean).join(" ") || "Bike details pending"}</small></b>
      <em>{lead.price || formatGbp(null)}</em>
      <span>{lead.website || "unknown"}</span>
      <span>{statusLabel(lead.status)}</span>
      <time>{formatLeadDate(lead.date || lead.created_at)}</time>
    </Link>)}</div>}
  </section>;
}
