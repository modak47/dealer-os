"use client";

import Link from "next/link";
import { Children, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { formatLeadDate, formatMileage, statusLabel } from "@/lib/website-leads";
import type { DealerLeadClaim, DealerLeadNote, DealerPortalAccount, DealerPurchase, DealerPurchaseFee } from "@/types/dealer-portal";
import type { WebsiteLead } from "@/types/website-lead";

type RelatedDealer = { id: string; trading_name: string; successful_purchase_fee?: number | null } | null;
type RelatedLead = { id: number; reg?: string | null; make?: string | null; model?: string | null; year?: string | null; mileage?: string | null; status?: string | null; postcode?: string | null; location_town?: string | null } | null;
type AdminClaim = DealerLeadClaim & { dealer?: RelatedDealer; lead?: RelatedLead };
type AdminNote = DealerLeadNote & { dealer?: RelatedDealer; lead?: RelatedLead };
type AdminPurchase = DealerPurchase & { dealer?: RelatedDealer; lead?: RelatedLead };
type AdminFee = DealerPurchaseFee & { dealer?: RelatedDealer; lead?: RelatedLead };
type AdminOverview = { claims: AdminClaim[]; notes: AdminNote[]; purchases: AdminPurchase[]; fees: AdminFee[] };
type BackfillResult = { id?: number; reg?: string | null; error?: string; skipped?: boolean; reason?: string };
type BackfillPayload = { processed?: number; checked?: number; failed?: number; skipped?: number; results?: BackfillResult[]; error?: string };
type AdminTab = "daily" | "dealers" | "oversight";

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

const emptyAccess = { email: "", password: "", role: "dealer_admin" };

export default function DealerPortalAdminPage() {
  const [accounts, setAccounts] = useState<DealerPortalAccount[]>([]);
  const [leads, setLeads] = useState<WebsiteLead[]>([]);
  const [overview, setOverview] = useState<AdminOverview>({ claims: [], notes: [], purchases: [], fees: [] });
  const [editing, setEditing] = useState<Partial<DealerPortalAccount> | null>(null);
  const [access, setAccess] = useState(emptyAccess);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedDealers, setSelectedDealers] = useState<string[]>([]);
  const [method, setMethod] = useState<"matching_pool" | "direct" | "dealer_group">("matching_pool");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("daily");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const [accountResponse, leadResponse, overviewResponse] = await Promise.all([
      fetch("/api/dealer-portal/admin/accounts", { cache: "no-store" }),
      fetch("/api/website-leads?limit=100", { cache: "no-store" }),
      fetch("/api/dealer-portal/admin/overview", { cache: "no-store" }),
    ]);
    const accountPayload = await accountResponse.json();
    const leadPayload = await leadResponse.json();
    const overviewPayload = await overviewResponse.json();
    if (accountResponse.ok) setAccounts(accountPayload.accounts ?? []);
    else setError(accountPayload.error || "Unable to load dealer portal accounts.");
    if (leadResponse.ok) setLeads(leadPayload.leads ?? []);
    else setError(leadPayload.error || "Unable to load website leads.");
    if (overviewResponse.ok) setOverview({ claims: overviewPayload.claims ?? [], notes: overviewPayload.notes ?? [], purchases: overviewPayload.purchases ?? [], fees: overviewPayload.fees ?? [] });
    else setError(overviewPayload.error || "Unable to load dealer portal overview.");
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeAccounts = useMemo(() => accounts.filter(account => account.account_status === "active"), [accounts]);
  const portalLeads = useMemo(() => leads.filter(lead => String(lead.status ?? "").startsWith("dealer_")), [leads]);
  const releaseableLeads = useMemo(() => leads.filter(lead => !["purchased", "internal_buying", "purchase_agreed", "dealer_claimed", "dealer_purchased"].includes(String(lead.status ?? ""))), [leads]);
  const kpis = [
    ["Active Dealers", activeAccounts.length],
    ["Portal Leads", portalLeads.length],
    ["Available to Release", releaseableLeads.length],
    ["Claims", overview.claims.length],
    ["Purchases", overview.purchases.length],
    ["Fees Pending", overview.fees.filter(fee => fee.status === "pending_invoice").length],
  ];

  function setField(key: keyof DealerPortalAccount, value: string | number) {
    setEditing(current => ({ ...(current ?? emptyAccount), [key]: value }));
  }

  function startEditing(account: Partial<DealerPortalAccount>) {
    setEditing(account);
    setAccess({ email: account.main_email ?? "", password: "", role: "dealer_admin" });
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
      const savedAccount = payload.account as DealerPortalAccount;
      if (access.email.trim()) {
        const accessResponse = await fetch(`/api/dealer-portal/admin/accounts/${savedAccount.id}/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(access),
        });
        const accessPayload = await accessResponse.json();
        if (!accessResponse.ok) {
          setError(accessPayload.error || "Dealer saved, but login access could not be created.");
          setSaving(false);
          return;
        }
      }
      setNotice(access.email.trim() ? "Dealer saved and portal login linked." : creating ? "Dealer portal account created." : "Dealer portal account updated.");
      setEditing(null);
      setAccess(emptyAccess);
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

  async function backfillVehicleChecks() {
    setBackfilling(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/dealer-portal/admin/backfill-vehicle-checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 25 }),
    });
    const payload = await response.json() as BackfillPayload;
    if (response.ok) {
      const firstFailure = payload.results?.find(result => result.error);
      const failureDetail = firstFailure ? ` First failure: ${firstFailure.reg ? `${firstFailure.reg} - ` : ""}${firstFailure.error}` : "";
      setNotice(`Vehicle check backfill processed ${payload.processed ?? 0} lead(s): ${payload.checked ?? 0} checked, ${payload.failed ?? 0} failed, ${payload.skipped ?? 0} skipped.${failureDetail}`);
      await load();
    } else setError(payload.error || "Unable to backfill vehicle checks.");
    setBackfilling(false);
  }

  function toggleDealer(id: string) {
    setSelectedDealers(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  return <main className="admin-page dealer-portal-admin-page">
    <div className="admin-heading"><div><h1>Dealer Portal</h1><p>Manage dealer buying accounts and release website leads for claim-based access.</p></div><div className="quick-actions"><Link href="/dealer-login" target="_blank">Dealer Login</Link><button className="admin-secondary" onClick={() => void backfillVehicleChecks()} disabled={backfilling}>{backfilling ? "Checking..." : "Run Missing Vehicle Checks"}</button><button className="admin-primary" onClick={() => startEditing(emptyAccount)}>Add Portal Dealer</button></div></div>
    <section className="website-kpis">{kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    {error && <div className="website-state error compact">{error}</div>}{notice && <div className="website-state success compact">{notice}</div>}
    <section className="dealer-admin-workspace">
      <nav className="dealer-admin-tabs" aria-label="Dealer portal admin sections">
        <button className={activeTab === "daily" ? "active" : ""} type="button" onClick={() => setActiveTab("daily")}><span>Daily</span><b>{portalLeads.length}</b></button>
        <button className={activeTab === "dealers" ? "active" : ""} type="button" onClick={() => setActiveTab("dealers")}><span>Dealers</span><b>{accounts.length}</b></button>
        <button className={activeTab === "oversight" ? "active" : ""} type="button" onClick={() => setActiveTab("oversight")}><span>Oversight</span><b>{overview.claims.length + overview.purchases.length}</b></button>
      </nav>
      {activeTab === "daily" && <section className="dealer-admin-panel dealer-admin-daily">
        <form className="website-detail-card dealer-release-card" onSubmit={releaseLead}>
          <header><div><h2>Release Lead</h2><p>Select a web lead and choose who can claim it.</p></div><span>{releaseableLeads.length} ready</span></header>
          <label><span>Website lead</span><select value={selectedLeadId} onChange={event => setSelectedLeadId(event.target.value)} required><option value="">Select lead</option>{releaseableLeads.map(lead => <option value={lead.id} key={lead.id}>#{lead.id} {lead.reg || "No reg"} {lead.make || ""} {lead.model || ""} - {statusLabel(lead.status)}</option>)}</select></label>
          <label><span>Distribution</span><select value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="matching_pool">Open matching pool</option><option value="direct">Specific dealer</option><option value="dealer_group">Dealer group</option></select></label>
          {method !== "matching_pool" && <div className="dealer-picker">{activeAccounts.map(account => <label key={account.id}><input type="checkbox" checked={selectedDealers.includes(account.id)} onChange={() => toggleDealer(account.id)} />{account.trading_name}</label>)}</div>}
          <div className="website-actions"><button disabled={saving || !selectedLeadId || (method !== "matching_pool" && !selectedDealers.length)}>{saving ? "Releasing..." : "Release to Portal"}</button><Link href="/dealer-login" target="_blank">Open Dealer Login</Link></div>
        </form>
        <section className="website-detail-card status-actions dealer-recent-leads">
          <header><div><h2>Recent Portal Leads</h2><p>Latest leads released, claimed, returned or purchased through the portal.</p></div><Link href="/website-leads">All Website Leads</Link></header>
          {!portalLeads.length ? <p>No website leads have been released to the dealer portal yet.</p> : <div className="referral-history-list">{portalLeads.slice(0, 10).map(lead => <article key={lead.id}><header><div><b>#{lead.id} {lead.reg || "No reg"} · {[lead.make, lead.model].filter(Boolean).join(" ") || "Motorcycle"}</b><span>{statusLabel(lead.status)} · {formatLeadDate(lead.date || lead.created_at)}</span></div><Link href={`/website-leads/${lead.id}`}>Open</Link></header><dl><div><dt>Mileage</dt><dd>{formatMileage(lead.mileage)}</dd></div><div><dt>Location</dt><dd>{lead.location_town || lead.postcode || "Not set"}</dd></div></dl></article>)}</div>}
        </section>
      </section>}
      {activeTab === "dealers" && <section className="dealer-admin-panel">
        <section className="website-detail-card dealer-portal-accounts">
          <header><div><h2>Portal Dealers</h2><p>Dealer accounts are hidden from the daily view to keep this page cleaner.</p></div><button className="admin-primary" onClick={() => startEditing(emptyAccount)}>Add Portal Dealer</button></header>
          {loading ? <p>Loading accounts...</p> : !accounts.length ? <p>No dealer portal accounts yet.</p> : <div className="dealer-contact-grid">{accounts.map(account => <article className="dealer-contact-card" key={account.id}><header><div><span>{account.account_status}</span><h2>{account.trading_name}</h2><p>{account.main_contact || "No main contact"} · {account.postcode || "Postcode not set"}</p></div><b>{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(account.successful_purchase_fee ?? 0))}</b></header><dl><div><dt>Email</dt><dd>{account.main_email || "-"}</dd></div><div><dt>Phone</dt><dd>{account.telephone || account.mobile_whatsapp || "-"}</dd></div><div><dt>Attribution</dt><dd>{account.attribution_period_days} days</dd></div><div><dt>Auto Trader</dt><dd>{account.autotrader_dealer_ref || "-"}</dd></div></dl><nav><button onClick={() => startEditing(account)}>Edit / Login</button></nav></article>)}</div>}
        </section>
      </section>}
      {activeTab === "oversight" && <section className="dealer-admin-panel">
        <section className="website-detail-card status-actions dealer-admin-oversight">
          <header><div><h2>Dealer Oversight</h2><p>Claims, notes, purchases and purchase fees in one place.</p></div></header>
          <div className="dealer-admin-overview-grid">
            <OverviewPanel title="Recent Claims" empty="No dealer claims yet.">{overview.claims.slice(0, 12).map(claim => <OverviewItem key={claim.id} title={`${claim.dealer?.trading_name || "Dealer"} claimed ${leadTitle(claim.lead)}`} meta={`${statusLabel(claim.status)} - ${formatLeadDate(claim.claimed_at)}`} href={`/website-leads/${claim.website_lead_id}`} />)}</OverviewPanel>
            <OverviewPanel title="Activity Notes" empty="No dealer activity yet.">{overview.notes.slice(0, 12).map(note => <OverviewItem key={note.id} title={`${note.dealer?.trading_name || "Dealer"} - ${note.note_type}`} meta={`${leadTitle(note.lead)} - ${formatLeadDate(note.created_at)}`} body={note.body} href={`/website-leads/${note.website_lead_id}`} />)}</OverviewPanel>
            <OverviewPanel title="Reported Purchases" empty="No dealer purchases reported yet.">{overview.purchases.slice(0, 12).map(purchase => <OverviewItem key={purchase.id} title={`${purchase.dealer?.trading_name || "Dealer"} - ${leadTitle(purchase.lead)}`} meta={`${money(purchase.purchase_price)} - ${formatLeadDate(purchase.reported_at)}`} body={purchase.purchase_type.replaceAll("_", " ")} href={`/website-leads/${purchase.website_lead_id}`} />)}</OverviewPanel>
            <OverviewPanel title="Purchase Fees" empty="No purchase fees yet.">{overview.fees.slice(0, 12).map(fee => <OverviewItem key={fee.id} title={`${fee.dealer?.trading_name || "Dealer"} - ${money(fee.fee_amount)}`} meta={`${statusLabel(fee.status)} - ${leadTitle(fee.lead)}`} body={fee.notes || undefined} href={`/website-leads/${fee.website_lead_id}`} />)}</OverviewPanel>
          </div>
        </section>
      </section>}
    </section>
    {editing && <div className="website-modal-backdrop" role="dialog" aria-modal="true"><form className="website-book-modal dealer-contact-modal" onSubmit={saveAccount}><header><div><h2>{editing.id ? "Edit Portal Dealer" : "Add Portal Dealer"}</h2><p>Save the dealer and optionally create/link their portal login in one step.</p></div><button type="button" onClick={() => { setEditing(null); setAccess(emptyAccess); }}>Close</button></header><div className="website-book-grid"><Input label="Trading name" value={editing.trading_name ?? ""} set={v => setField("trading_name", v)} required /><Input label="Limited company" value={editing.limited_company_name ?? ""} set={v => setField("limited_company_name", v)} /><Input label="Main contact" value={editing.main_contact ?? ""} set={v => setField("main_contact", v)} /><Input label="Main email" value={editing.main_email ?? ""} set={v => setField("main_email", v)} type="email" /><Input label="Telephone" value={editing.telephone ?? ""} set={v => setField("telephone", v)} /><Input label="WhatsApp/mobile" value={editing.mobile_whatsapp ?? ""} set={v => setField("mobile_whatsapp", v)} /><Input label="Postcode" value={editing.postcode ?? ""} set={v => setField("postcode", v)} /><Input label="Auto Trader ref" value={editing.autotrader_dealer_ref ?? ""} set={v => setField("autotrader_dealer_ref", v)} /><label><span>Status</span><select value={editing.account_status ?? "pending"} onChange={event => setField("account_status", event.target.value)}><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select></label><Input label="Purchase fee" value={String(editing.successful_purchase_fee ?? 50)} set={v => setField("successful_purchase_fee", Number(v))} type="number" /><Input label="Attribution days" value={String(editing.attribution_period_days ?? 60)} set={v => setField("attribution_period_days", Number(v))} type="number" /><label className="full"><span>Internal notes</span><textarea value={editing.internal_notes ?? ""} onChange={event => setField("internal_notes", event.target.value)} /></label><div className="full dealer-login-fields"><h3>Dealer Login</h3><p>Enter an email and temporary password to create or link this dealer&apos;s login. Leave blank if you only want to save the dealer record.</p></div><Input label="Login email" value={access.email} set={v => setAccess(current => ({ ...current, email: v }))} type="email" /><Input label="Temporary password" value={access.password} set={v => setAccess(current => ({ ...current, password: v }))} type="password" /><label><span>Portal role</span><select value={access.role} onChange={event => setAccess(current => ({ ...current, role: event.target.value }))}><option value="dealer_admin">Dealer Admin</option><option value="dealer_user">Dealer User</option></select></label><div className="dealer-login-link"><span>Login page</span><Link href="/dealer-login" target="_blank">Open dealer login</Link></div></div><footer><button type="button" onClick={() => { setEditing(null); setAccess(emptyAccess); }}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving..." : access.email.trim() ? "Save Dealer & Login" : "Save Dealer"}</button></footer></form></div>}
  </main>;
}

function Input({ label, value, set, type = "text", required = false }: { label: string; value: string; set: (value: string) => void; type?: string; required?: boolean }) {
  return <label><span>{label}</span><input type={type} value={value} required={required} min={type === "number" ? "0" : undefined} onChange={event => set(event.target.value)} /></label>;
}

function OverviewPanel({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  return <section><h3>{title}</h3>{Children.count(children) ? <div>{children}</div> : <p>{empty}</p>}</section>;
}

function OverviewItem({ title, meta, body, href }: { title: string; meta: string; body?: string; href: string }) {
  return <article><div><b>{title}</b><span>{meta}</span>{body && <p>{body}</p>}</div><Link href={href}>Open</Link></article>;
}

function leadTitle(lead: RelatedLead | undefined) {
  if (!lead) return "Unknown lead";
  return `#${lead.id} ${lead.reg || "No reg"} ${[lead.year, lead.make, lead.model].filter(Boolean).join(" ")}`.trim();
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(value ?? 0) || 0);
}
