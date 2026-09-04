"use client";

import Link from "next/link";
import { Children, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { formatGbp, formatLeadDate, formatMileage, safeNumber, statusLabel } from "@/lib/website-leads";
import type { DealerBuyingPreferences, DealerGeographyPreferences, DealerLeadClaim, DealerLeadNote, DealerPortalAccount, DealerPortalAccountWithPreferences, DealerPurchase, DealerPurchaseFee } from "@/types/dealer-portal";
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
type DealerModalTab = "account" | "buying" | "history" | "geography" | "login";

const emptyAccount: Partial<DealerPortalAccountWithPreferences> = {
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

const emptyAccess = { email: "", role: "dealer_admin" };

function defaultBuyingPreferences(dealerId = ""): DealerBuyingPreferences {
  return {
    dealer_account_id: dealerId,
    motorcycle_types: [],
    makes_wanted: [],
    makes_excluded: [],
    models_wanted: [],
    minimum_year: null,
    maximum_age_years: null,
    minimum_value: null,
    maximum_value: null,
    maximum_mileage: null,
    minimum_engine_cc: null,
    maximum_engine_cc: null,
    accepts_non_running: false,
    accepts_insurance_category: false,
    accepts_outstanding_finance: false,
    accepts_imported: false,
    accepts_modified: false,
  };
}

function defaultGeographyPreferences(dealerId = ""): DealerGeographyPreferences {
  return {
    dealer_account_id: dealerId,
    england: true,
    wales: true,
    scotland: false,
    northern_ireland: false,
    republic_of_ireland: false,
    maximum_radius_miles: null,
  };
}

function prepareEditingAccount(account: Partial<DealerPortalAccountWithPreferences>): Partial<DealerPortalAccountWithPreferences> {
  return {
    ...emptyAccount,
    ...account,
    buying_preferences: { ...defaultBuyingPreferences(account.id), ...(account.buying_preferences ?? {}) },
    geography_preferences: { ...defaultGeographyPreferences(account.id), ...(account.geography_preferences ?? {}) },
  };
}

function arrayText(value: string[] | null | undefined) {
  return (value ?? []).join(", ");
}

function splitArrayText(value: string) {
  return Array.from(new Set(value.split(",").map(item => item.trim()).filter(Boolean)));
}

export default function DealerPortalAdminPage() {
  const [accounts, setAccounts] = useState<DealerPortalAccountWithPreferences[]>([]);
  const [leads, setLeads] = useState<WebsiteLead[]>([]);
  const [overview, setOverview] = useState<AdminOverview>({ claims: [], notes: [], purchases: [], fees: [] });
  const [editing, setEditing] = useState<Partial<DealerPortalAccountWithPreferences> | null>(null);
  const [access, setAccess] = useState(emptyAccess);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [releaseQuery, setReleaseQuery] = useState("");
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
  const releaseQueue = useMemo(() => {
    const search = releaseQuery.trim().toLowerCase();
    return releaseableLeads.filter(lead => {
      const text = [lead.id, lead.reg, lead.make, lead.model, lead.year, lead.mileage, lead.price, lead.location_town, lead.postcode, lead.status].join(" ").toLowerCase();
      return !search || text.includes(search);
    }).slice(0, 18);
  }, [releaseQuery, releaseableLeads]);
  const selectedLeads = useMemo(() => releaseableLeads.filter(lead => selectedLeadIds.includes(String(lead.id))), [releaseableLeads, selectedLeadIds]);
  const pendingFees = useMemo(() => overview.fees.filter(fee => fee.status === "pending_invoice"), [overview.fees]);
  const pendingFeeTotal = useMemo(() => pendingFees.reduce((total, fee) => total + (Number(fee.fee_amount) || 0), 0), [pendingFees]);
  const kpis = [
    ["Active Dealers", activeAccounts.length],
    ["Portal Leads", portalLeads.length],
    ["Available to Release", releaseableLeads.length],
    ["Claims", overview.claims.length],
    ["Purchases", overview.purchases.length],
    [`Fees Pending (${pendingFees.length})`, money(pendingFeeTotal)],
  ];

  function setField(key: keyof DealerPortalAccount, value: string | number) {
    setEditing(current => ({ ...(current ?? emptyAccount), [key]: value }));
  }

  function setBuyingField<K extends keyof DealerBuyingPreferences>(key: K, value: DealerBuyingPreferences[K]) {
    setEditing(current => {
      const account = prepareEditingAccount(current ?? emptyAccount);
      return { ...account, buying_preferences: { ...defaultBuyingPreferences(account.id), ...(account.buying_preferences ?? {}), [key]: value } };
    });
  }

  function setGeographyField<K extends keyof DealerGeographyPreferences>(key: K, value: DealerGeographyPreferences[K]) {
    setEditing(current => {
      const account = prepareEditingAccount(current ?? emptyAccount);
      return { ...account, geography_preferences: { ...defaultGeographyPreferences(account.id), ...(account.geography_preferences ?? {}), [key]: value } };
    });
  }

  function startEditing(account: Partial<DealerPortalAccountWithPreferences>) {
    setEditing(prepareEditingAccount(account));
    setAccess({ email: account.main_email ?? "", role: "dealer_admin" });
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
      const savedAccount = payload.account as DealerPortalAccountWithPreferences;
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
    if (!selectedLeadIds.length) return;
    setSaving(true);
    setError("");
    setNotice("");
    const failures: string[] = [];
    let allocationCount = 0;
    for (const websiteLeadId of selectedLeadIds) {
      const response = await fetch("/api/dealer-portal/admin/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website_lead_id: websiteLeadId,
          allocation_method: method,
          dealer_account_ids: method === "matching_pool" ? [] : selectedDealers,
        }),
      });
      const payload = await response.json();
      if (response.ok) allocationCount += payload.allocations?.length ?? 0;
      else failures.push(`#${websiteLeadId}: ${payload.error || "Unable to release lead."}`);
    }
    if (!failures.length) {
      setNotice(`${selectedLeadIds.length} lead(s) released to ${allocationCount} dealer portal allocation(s).`);
      setSelectedLeadIds([]);
      setSelectedDealers([]);
      await load();
    } else {
      setError(`Released with ${failures.length} failure(s). ${failures.join(" ")}`);
      await load();
    }
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

  function toggleLead(id: string) {
    setSelectedLeadIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  function selectVisibleQueue() {
    setSelectedLeadIds(current => Array.from(new Set([...current, ...releaseQueue.map(lead => String(lead.id))])));
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
          <header><div><h2>Leads Ready to Release</h2><p>Pick from the visible queue before releasing to dealers.</p></div><span>{releaseableLeads.length} ready</span></header>
          <div className="dealer-release-search"><input value={releaseQuery} onChange={event => setReleaseQuery(event.target.value)} placeholder="Search reg, bike, location or price" aria-label="Search releasable leads" /><button className="secondary" type="button" onClick={selectVisibleQueue} disabled={!releaseQueue.length}>Select visible</button>{releaseQuery && <button className="ghost" type="button" onClick={() => setReleaseQuery("")}>Clear</button>}</div>
          <div className="dealer-release-queue">
            {loading ? <p>Loading leads...</p> : !releaseQueue.length ? <p>No releasable leads match this search.</p> : releaseQueue.map(lead => <ReleaseQueueRow lead={lead} selected={selectedLeadIds.includes(String(lead.id))} saving={saving} key={lead.id} onSelect={() => toggleLead(String(lead.id))} />)}
          </div>
          <div className="dealer-release-controls">
            <div className="dealer-release-selected"><span>Selected</span><b>{selectedLeads.length ? `${selectedLeads.length} lead(s): ${selectedLeads.slice(0, 3).map(lead => `#${lead.id} ${lead.reg || "No reg"}`).join(", ")}${selectedLeads.length > 3 ? "..." : ""}` : "No leads selected"}</b>{selectedLeads.length > 0 && <button type="button" onClick={() => setSelectedLeadIds([])}>Clear selection</button>}</div>
            <label><span>Distribution</span><select value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="matching_pool">Open matching pool</option><option value="direct">Specific dealer</option><option value="dealer_group">Dealer group</option></select></label>
            {method !== "matching_pool" && <div className="dealer-picker">{activeAccounts.map(account => <label key={account.id}><input type="checkbox" checked={selectedDealers.includes(account.id)} onChange={() => toggleDealer(account.id)} />{account.trading_name}</label>)}</div>}
            <div className="website-actions dealer-release-actions"><button className="dealer-release-submit" disabled={saving || !selectedLeadIds.length || (method !== "matching_pool" && !selectedDealers.length)}>{saving ? "Releasing..." : selectedLeadIds.length > 1 ? `Release ${selectedLeadIds.length} Leads` : "Release to Portal"}</button><Link href="/dealer-login" target="_blank">Open Dealer Login</Link></div>
          </div>
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
    {editing && <DealerAccountModal editing={editing} access={access} saving={saving} setAccess={setAccess} setField={setField} setBuyingField={setBuyingField} setGeographyField={setGeographyField} onSubmit={saveAccount} onClose={() => { setEditing(null); setAccess(emptyAccess); }} />}
  </main>;
}

function DealerAccountModal({ editing, access, saving, setAccess, setField, setBuyingField, setGeographyField, onSubmit, onClose }: {
  editing: Partial<DealerPortalAccountWithPreferences>;
  access: typeof emptyAccess;
  saving: boolean;
  setAccess: (updater: typeof emptyAccess | ((current: typeof emptyAccess) => typeof emptyAccess)) => void;
  setField: (key: keyof DealerPortalAccount, value: string | number) => void;
  setBuyingField: <K extends keyof DealerBuyingPreferences>(key: K, value: DealerBuyingPreferences[K]) => void;
  setGeographyField: <K extends keyof DealerGeographyPreferences>(key: K, value: DealerGeographyPreferences[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const [modalTab, setModalTab] = useState<DealerModalTab>("account");
  const buying = editing.buying_preferences ?? defaultBuyingPreferences(editing.id);
  const geography = editing.geography_preferences ?? defaultGeographyPreferences(editing.id);
  const tabs: [DealerModalTab, string, string][] = [
    ["account", "Account", "Company profile"],
    ["buying", "Buying", "Makes and ranges"],
    ["history", "History", "Vehicle rules"],
    ["geography", "Geography", "Countries and radius"],
    ["login", "Login", "Portal access"],
  ];
  return <div className="website-modal-backdrop" role="dialog" aria-modal="true">
    <form className="website-book-modal dealer-contact-modal dealer-account-modal" onSubmit={onSubmit}>
      <header><div><h2>{editing.id ? "Edit Portal Dealer" : "Add Portal Dealer"}</h2><p>Company details, login setup, buying preferences and geography rules.</p></div><button type="button" onClick={onClose}>Close</button></header>
      <div className="dealer-modal-shell">
        <nav className="dealer-modal-tabs" aria-label="Dealer account sections">
          {tabs.map(([key, label, sub]) => <button className={modalTab === key ? "active" : ""} type="button" onClick={() => setModalTab(key)} key={key}><b>{label}</b><span>{sub}</span></button>)}
        </nav>
        <div className="dealer-modal-tab-body">
          {modalTab === "account" && <section className="dealer-modal-section"><h3><span>01</span>Dealer Account</h3><div className="dealer-modal-grid"><Input label="Trading name" value={editing.trading_name ?? ""} set={v => setField("trading_name", v)} required /><Input label="Limited company" value={editing.limited_company_name ?? ""} set={v => setField("limited_company_name", v)} /><Input label="Company reg" value={editing.company_registration_number ?? ""} set={v => setField("company_registration_number", v)} /><Input label="VAT number" value={editing.vat_number ?? ""} set={v => setField("vat_number", v)} /><Input label="Main contact" value={editing.main_contact ?? ""} set={v => setField("main_contact", v)} /><Input label="Main email" value={editing.main_email ?? ""} set={v => setField("main_email", v)} type="email" /><Input label="Telephone" value={editing.telephone ?? ""} set={v => setField("telephone", v)} /><Input label="WhatsApp/mobile" value={editing.mobile_whatsapp ?? ""} set={v => setField("mobile_whatsapp", v)} /><Input label="Accounts email" value={editing.accounts_email ?? ""} set={v => setField("accounts_email", v)} type="email" /><Input label="Website" value={editing.website ?? ""} set={v => setField("website", v)} /><Input label="Postcode" value={editing.postcode ?? ""} set={v => setField("postcode", v)} /><Input label="Auto Trader ref" value={editing.autotrader_dealer_ref ?? ""} set={v => setField("autotrader_dealer_ref", v)} /><label><span>Status</span><select value={editing.account_status ?? "pending"} onChange={event => setField("account_status", event.target.value)}><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select></label><Input label="Purchase fee" value={String(editing.successful_purchase_fee ?? 50)} set={v => setField("successful_purchase_fee", Number(v))} type="number" /><Input label="Attribution days" value={String(editing.attribution_period_days ?? 60)} set={v => setField("attribution_period_days", Number(v))} type="number" /><label className="full"><span>Trading address</span><textarea value={editing.trading_address ?? ""} onChange={event => setField("trading_address", event.target.value)} /></label><label className="full"><span>Registered address</span><textarea value={editing.registered_address ?? ""} onChange={event => setField("registered_address", event.target.value)} /></label><label className="full compact-notes"><span>Internal notes</span><textarea value={editing.internal_notes ?? ""} onChange={event => setField("internal_notes", event.target.value)} /></label></div></section>}
          {modalTab === "buying" && <section className="dealer-modal-section"><h3><span>02</span>Buying Preferences</h3><div className="dealer-modal-grid"><AdminTextListInput label="Types" value={buying.motorcycle_types} set={value => setBuyingField("motorcycle_types", value)} /><AdminTextListInput label="Makes wanted" value={buying.makes_wanted} set={value => setBuyingField("makes_wanted", value)} /><AdminTextListInput label="Makes excluded" value={buying.makes_excluded} set={value => setBuyingField("makes_excluded", value)} /><AdminTextListInput label="Models wanted" value={buying.models_wanted} set={value => setBuyingField("models_wanted", value)} /><AdminNumberPreference label="Minimum year" value={buying.minimum_year} set={value => setBuyingField("minimum_year", value)} /><AdminNumberPreference label="Max age years" value={buying.maximum_age_years} set={value => setBuyingField("maximum_age_years", value)} /><AdminNumberPreference label="Min value" value={buying.minimum_value} set={value => setBuyingField("minimum_value", value)} /><AdminNumberPreference label="Max value" value={buying.maximum_value} set={value => setBuyingField("maximum_value", value)} /><AdminNumberPreference label="Max mileage" value={buying.maximum_mileage} set={value => setBuyingField("maximum_mileage", value)} /><AdminNumberPreference label="Min engine cc" value={buying.minimum_engine_cc} set={value => setBuyingField("minimum_engine_cc", value)} /><AdminNumberPreference label="Max engine cc" value={buying.maximum_engine_cc} set={value => setBuyingField("maximum_engine_cc", value)} /></div></section>}
          {modalTab === "history" && <section className="dealer-modal-section dealer-modal-split"><div><h3><span>03</span>Vehicle History Rules</h3><p>These rules are for preference matching later. They do not expose internal valuation data to the dealer.</p></div><div className="dealer-modal-checks"><AdminCheckbox label="Accept non-running" checked={buying.accepts_non_running} set={value => setBuyingField("accepts_non_running", value)} /><AdminCheckbox label="Accept insurance category" checked={buying.accepts_insurance_category} set={value => setBuyingField("accepts_insurance_category", value)} /><AdminCheckbox label="Accept outstanding finance" checked={buying.accepts_outstanding_finance} set={value => setBuyingField("accepts_outstanding_finance", value)} /><AdminCheckbox label="Accept imported" checked={buying.accepts_imported} set={value => setBuyingField("accepts_imported", value)} /><AdminCheckbox label="Accept modified" checked={buying.accepts_modified} set={value => setBuyingField("accepts_modified", value)} /></div></section>}
          {modalTab === "geography" && <section className="dealer-modal-section dealer-modal-split"><div><h3><span>04</span>Geography</h3><p>Set where this dealer wants to buy from, plus the maximum distance from their dealership.</p></div><div><div className="dealer-modal-checks"><AdminCheckbox label="England" checked={geography.england} set={value => setGeographyField("england", value)} /><AdminCheckbox label="Wales" checked={geography.wales} set={value => setGeographyField("wales", value)} /><AdminCheckbox label="Scotland" checked={geography.scotland} set={value => setGeographyField("scotland", value)} /><AdminCheckbox label="Northern Ireland" checked={geography.northern_ireland} set={value => setGeographyField("northern_ireland", value)} /><AdminCheckbox label="Republic of Ireland" checked={geography.republic_of_ireland} set={value => setGeographyField("republic_of_ireland", value)} /></div><div className="dealer-modal-radius"><AdminNumberPreference label="Buying radius miles" value={geography.maximum_radius_miles} set={value => setGeographyField("maximum_radius_miles", value)} /></div></div></section>}
          {modalTab === "login" && <section className="dealer-modal-section dealer-modal-split"><div className="dealer-login-fields"><h3><span>05</span>Dealer Login</h3><p>Enter an email to invite or link this dealer&apos;s login. Leave blank if you only want to save the dealer record.</p><Link href="/dealer-login" target="_blank">Open dealer login</Link></div><div className="dealer-modal-grid two"><Input label="Login email" value={access.email} set={v => setAccess(current => ({ ...current, email: v }))} type="email" /><label><span>Portal role</span><select value={access.role} onChange={event => setAccess(current => ({ ...current, role: event.target.value }))}><option value="dealer_admin">Dealer Admin</option><option value="dealer_user">Dealer User</option></select></label></div></section>}
        </div>
      </div>
      <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving..." : access.email.trim() ? "Save Dealer & Login" : "Save Dealer"}</button></footer>
    </form>
  </div>;
}

function Input({ label, value, set, type = "text", required = false }: { label: string; value: string; set: (value: string) => void; type?: string; required?: boolean }) {
  return <label><span>{label}</span><input type={type} value={value} required={required} min={type === "number" ? "0" : undefined} onChange={event => set(event.target.value)} /></label>;
}

function AdminTextListInput({ label, value, set }: { label: string; value: string[]; set: (value: string[]) => void }) {
  return <label><span>{label}</span><input value={arrayText(value)} onChange={event => set(splitArrayText(event.target.value))} placeholder="Comma separated" /></label>;
}

function AdminNumberPreference({ label, value, set }: { label: string; value: number | null; set: (value: number | null) => void }) {
  return <label><span>{label}</span><input type="number" min="0" value={value ?? ""} onChange={event => set(event.target.value === "" ? null : Number(event.target.value))} /></label>;
}

function AdminCheckbox({ label, checked, set }: { label: string; checked: boolean; set: (value: boolean) => void }) {
  return <label><input type="checkbox" checked={checked} onChange={event => set(event.target.checked)} /><span>{label}</span></label>;
}

function ReleaseQueueRow({ lead, selected, saving, onSelect }: { lead: WebsiteLead; selected: boolean; saving: boolean; onSelect: () => void }) {
  const price = safeNumber(lead.price);
  const title = [lead.make, lead.model].filter(Boolean).join(" ") || "Motorcycle";
  const location = lead.location_town || lead.postcode || "Location not set";
  const checkStatus = lead.vehicle_check_status === "checked" ? "Check done" : lead.vehicle_check_status === "failed" ? "Check failed" : lead.reg ? "Check pending" : "No reg";
  return <article className={selected ? "selected" : ""}>
    <button className="dealer-release-toggle" type="button" disabled={saving} onClick={onSelect}><span>{selected ? "Remove" : "Select"}</span></button>
    <div className="dealer-release-bike"><b>#{lead.id} {lead.reg || "No reg"}</b><strong>{lead.year ? `${lead.year} ` : ""}{title}</strong><small>{statusLabel(lead.status)} · {formatLeadDate(lead.date || lead.created_at)}</small></div>
    <dl>
      <div><dt>Location</dt><dd>{location}</dd></div>
      <div><dt>Mileage</dt><dd>{formatMileage(lead.mileage)}</dd></div>
      <div><dt>Asking</dt><dd>{price === null ? "Not set" : formatGbp(price)}</dd></div>
      <div><dt>Vehicle Check</dt><dd>{checkStatus}</dd></div>
    </dl>
    <Link className="dealer-release-open" href={`/website-leads/${lead.id}`}>Open</Link>
  </article>;
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
