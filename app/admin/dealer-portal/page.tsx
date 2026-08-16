"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formatLeadDate, formatMileage, statusLabel } from "@/lib/website-leads";
import type { DealerPortalAccount } from "@/types/dealer-portal";
import type { WebsiteLead } from "@/types/website-lead";

const emptyAccount: Partial<DealerPortalAccount> = {
  trading_name: "",
  main_contact: "",
  main_email: "",
  telephone: "",
  mobile_whatsapp: "",
  postcode: "",
  account_status: "active",
  successful_purchase_fee: 50,
  attribution_period_days: 60,
};

export default function DealerPortalAdminPage() {
  const [accounts, setAccounts] = useState<DealerPortalAccount[]>([]);
  const [leads, setLeads] = useState<WebsiteLead[]>([]);
  const [editing, setEditing] = useState<Partial<DealerPortalAccount> | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedDealers, setSelectedDealers] = useState<string[]>([]);
  const [method, setMethod] = useState<"matching_pool" | "direct" | "dealer_group">("matching_pool");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const [accountResponse, leadResponse] = await Promise.all([
      fetch("/api/dealer-portal/admin/accounts", { cache: "no-store" }),
      fetch("/api/website-leads?limit=100", { cache: "no-store" }),
    ]);
    const accountPayload = await accountResponse.json();
    const leadPayload = await leadResponse.json();
    if (accountResponse.ok) setAccounts(accountPayload.accounts ?? []);
    else setError(accountPayload.error || "Unable to load dealer portal accounts.");
    if (leadResponse.ok) setLeads(leadPayload.leads ?? []);
    else setError(leadPayload.error || "Unable to load website leads.");
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeAccounts = useMemo(() => accounts.filter(account => account.account_status === "active"), [accounts]);
  const portalLeads = useMemo(() => leads.filter(lead => String(lead.status ?? "").startsWith("dealer_")), [leads]);
  const releaseableLeads = useMemo(() => leads.filter(lead => !["purchased", "purchase_agreed", "dealer_claimed", "dealer_purchased"].includes(String(lead.status ?? ""))), [leads]);
  const kpis = [
    ["Active Dealers", activeAccounts.length],
    ["Portal Leads", portalLeads.length],
    ["Available to Release", releaseableLeads.length],
    ["Claimed", leads.filter(lead => lead.status === "dealer_claimed").length],
  ];

  function setField(key: keyof DealerPortalAccount, value: string | number) {
    setEditing(current => ({ ...(current ?? emptyAccount), [key]: value }));
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    setNotice("");
    const creating = !editing.id;
    const response = await fetch(creating ? "/api/dealer-portal/admin/accounts" : `/api/dealer-portal/admin/accounts/${editing.id}`, {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const payload = await response.json();
    if (response.ok) {
      setNotice(creating ? "Dealer portal account created." : "Dealer portal account updated.");
      setEditing(null);
      await load();
    } else setError(payload.error || "Unable to save dealer portal account.");
    setSaving(false);
  }

  async function releaseLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/dealer-portal/admin/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        website_lead_id: selectedLeadId,
        allocation_method: method,
        dealer_account_ids: method === "matching_pool" ? [] : selectedDealers,
      }),
    });
    const payload = await response.json();
    if (response.ok) {
      setNotice(`Lead released to ${payload.allocations?.length ?? 0} dealer portal account(s).`);
      setSelectedLeadId("");
      setSelectedDealers([]);
      await load();
    } else setError(payload.error || "Unable to release lead.");
    setSaving(false);
  }

  function toggleDealer(id: string) {
    setSelectedDealers(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  return <main className="admin-page dealer-portal-admin-page">
    <div className="admin-heading"><div><h1>Dealer Portal</h1><p>Manage dealer buying accounts and release website leads for claim-based access.</p></div><button className="admin-primary" onClick={() => setEditing(emptyAccount)}>Add Portal Dealer</button></div>
    <section className="website-kpis">{kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    {error && <div className="website-state error compact">{error}</div>}{notice && <div className="website-state success compact">{notice}</div>}
    <section className="website-detail-grid dealer-portal-grid">
      <form className="website-detail-card dealer-release-card" onSubmit={releaseLead}>
        <h2>Release Lead</h2>
        <label><span>Website lead</span><select value={selectedLeadId} onChange={event => setSelectedLeadId(event.target.value)} required><option value="">Select lead</option>{releaseableLeads.map(lead => <option value={lead.id} key={lead.id}>#{lead.id} {lead.reg || "No reg"} {lead.make || ""} {lead.model || ""} - {statusLabel(lead.status)}</option>)}</select></label>
        <label><span>Distribution</span><select value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="matching_pool">Open matching pool</option><option value="direct">Specific dealer</option><option value="dealer_group">Dealer group</option></select></label>
        {method !== "matching_pool" && <div className="dealer-picker">{activeAccounts.map(account => <label key={account.id}><input type="checkbox" checked={selectedDealers.includes(account.id)} onChange={() => toggleDealer(account.id)} />{account.trading_name}</label>)}</div>}
        <div className="website-actions"><button disabled={saving || !selectedLeadId || (method !== "matching_pool" && !selectedDealers.length)}>{saving ? "Releasing..." : "Release to Portal"}</button><Link href="/dealer-portal" target="_blank">Open Dealer Portal</Link></div>
      </form>
      <section className="website-detail-card dealer-portal-accounts">
        <h2>Portal Dealers</h2>
        {loading ? <p>Loading accounts...</p> : !accounts.length ? <p>No dealer portal accounts yet.</p> : <div className="dealer-contact-grid">{accounts.map(account => <article className="dealer-contact-card" key={account.id}><header><div><span>{account.account_status}</span><h2>{account.trading_name}</h2><p>{account.main_contact || "No main contact"} · {account.postcode || "Postcode not set"}</p></div><b>{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(account.successful_purchase_fee ?? 0))}</b></header><dl><div><dt>Email</dt><dd>{account.main_email || "-"}</dd></div><div><dt>Phone</dt><dd>{account.telephone || account.mobile_whatsapp || "-"}</dd></div><div><dt>Attribution</dt><dd>{account.attribution_period_days} days</dd></div><div><dt>Auto Trader</dt><dd>{account.autotrader_dealer_ref || "-"}</dd></div></dl><nav><button onClick={() => setEditing(account)}>Edit</button></nav></article>)}</div>}
      </section>
      <section className="website-detail-card status-actions">
        <h2>Recent Portal Leads</h2>
        {!portalLeads.length ? <p>No website leads have been released to the dealer portal yet.</p> : <div className="referral-history-list">{portalLeads.slice(0, 12).map(lead => <article key={lead.id}><header><div><b>#{lead.id} {lead.reg || "No reg"} · {[lead.make, lead.model].filter(Boolean).join(" ") || "Motorcycle"}</b><span>{statusLabel(lead.status)} · {formatLeadDate(lead.date || lead.created_at)}</span></div><Link href={`/website-leads/${lead.id}`}>Open</Link></header><dl><div><dt>Mileage</dt><dd>{formatMileage(lead.mileage)}</dd></div><div><dt>Location</dt><dd>{lead.location_town || lead.postcode || "Not set"}</dd></div></dl></article>)}</div>}
      </section>
    </section>
    {editing && <div className="website-modal-backdrop" role="dialog" aria-modal="true"><form className="website-book-modal dealer-contact-modal" onSubmit={saveAccount}><header><div><h2>{editing.id ? "Edit Portal Dealer" : "Add Portal Dealer"}</h2><p>These settings control claim access and successful purchase fees.</p></div><button type="button" onClick={() => setEditing(null)}>Close</button></header><div className="website-book-grid"><Input label="Trading name" value={editing.trading_name ?? ""} set={v => setField("trading_name", v)} required /><Input label="Limited company" value={editing.limited_company_name ?? ""} set={v => setField("limited_company_name", v)} /><Input label="Main contact" value={editing.main_contact ?? ""} set={v => setField("main_contact", v)} /><Input label="Main email" value={editing.main_email ?? ""} set={v => setField("main_email", v)} type="email" /><Input label="Telephone" value={editing.telephone ?? ""} set={v => setField("telephone", v)} /><Input label="WhatsApp/mobile" value={editing.mobile_whatsapp ?? ""} set={v => setField("mobile_whatsapp", v)} /><Input label="Postcode" value={editing.postcode ?? ""} set={v => setField("postcode", v)} /><Input label="Auto Trader ref" value={editing.autotrader_dealer_ref ?? ""} set={v => setField("autotrader_dealer_ref", v)} /><label><span>Status</span><select value={editing.account_status ?? "pending"} onChange={event => setField("account_status", event.target.value)}><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select></label><Input label="Purchase fee" value={String(editing.successful_purchase_fee ?? 50)} set={v => setField("successful_purchase_fee", Number(v))} type="number" /><Input label="Attribution days" value={String(editing.attribution_period_days ?? 60)} set={v => setField("attribution_period_days", Number(v))} type="number" /><label className="full"><span>Internal notes</span><textarea value={editing.internal_notes ?? ""} onChange={event => setField("internal_notes", event.target.value)} /></label></div><footer><button type="button" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving..." : "Save Dealer"}</button></footer></form></div>}
  </main>;
}

function Input({ label, value, set, type = "text", required = false }: { label: string; value: string; set: (value: string) => void; type?: string; required?: boolean }) {
  return <label><span>{label}</span><input type={type} value={value} required={required} min={type === "number" ? "0" : undefined} onChange={event => set(event.target.value)} /></label>;
}
