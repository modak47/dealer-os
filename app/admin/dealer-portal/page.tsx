"use client";

import Link from "next/link";
import { Children, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { formatLeadDate, statusLabel } from "@/lib/website-leads";
import type { DealerBuyingPreferences, DealerFeeLedgerEntry, DealerGeographyPreferences, DealerLeadClaim, DealerLeadNote, DealerPortalAccount, DealerPortalAccountWithPreferences, DealerPurchase, DealerPurchaseFee } from "@/types/dealer-portal";
import { LeadBrowser } from "@/app/website-leads/lead-browser";

type RelatedDealer = { id: string; trading_name: string; successful_purchase_fee?: number | null } | null;
type RelatedLead = { id: number; reg?: string | null; make?: string | null; model?: string | null; year?: string | null; mileage?: string | null; status?: string | null; postcode?: string | null; location_town?: string | null } | null;
type AdminClaim = DealerLeadClaim & { dealer?: RelatedDealer; lead?: RelatedLead };
type AdminNote = DealerLeadNote & { dealer?: RelatedDealer; lead?: RelatedLead };
type AdminPurchase = DealerPurchase & { dealer?: RelatedDealer; lead?: RelatedLead };
type AdminFee = DealerPurchaseFee & { dealer?: RelatedDealer; lead?: RelatedLead; purchase?: Pick<DealerPurchase, "id" | "purchase_type" | "purchase_price" | "purchase_date" | "reported_at"> | null };
type AdminLedger = DealerFeeLedgerEntry & { dealer?: RelatedDealer; lead?: RelatedLead };
type AdminOverview = { claims: AdminClaim[]; notes: AdminNote[]; purchases: AdminPurchase[]; fees: AdminFee[]; ledger: AdminLedger[] };
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
  account_status: "pending",
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
  const [overview, setOverview] = useState<AdminOverview>({ claims: [], notes: [], purchases: [], fees: [], ledger: [] });
  const [editing, setEditing] = useState<Partial<DealerPortalAccountWithPreferences> | null>(null);
  const [access, setAccess] = useState(emptyAccess);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("daily");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const [accountResponse, overviewResponse] = await Promise.all([
      fetch("/api/dealer-portal/admin/accounts", { cache: "no-store" }),
      fetch("/api/dealer-portal/admin/overview", { cache: "no-store" }),
    ]);
    const accountPayload = await accountResponse.json();
    const overviewPayload = await overviewResponse.json();
    if (accountResponse.ok) setAccounts(accountPayload.accounts ?? []);
    else setError(accountPayload.error || "Unable to load dealer portal accounts.");
    if (overviewResponse.ok) setOverview({ claims: overviewPayload.claims ?? [], notes: overviewPayload.notes ?? [], purchases: overviewPayload.purchases ?? [], fees: overviewPayload.fees ?? [], ledger: overviewPayload.ledger ?? [] });
    else setError(overviewPayload.error || "Unable to load dealer portal overview.");
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeAccounts = useMemo(() => accounts.filter(account => account.account_status === "active"), [accounts]);
  const groupedAccounts = useMemo(() => ({
    pending: accounts.filter(account => account.account_status === "pending"),
    active: accounts.filter(account => account.account_status === "active"),
    rejected: accounts.filter(account => account.account_status === "rejected"),
    suspended: accounts.filter(account => account.account_status === "suspended"),
  }), [accounts]);
  const pendingFees = useMemo(() => overview.fees.filter(fee => fee.status !== "paid" && fee.status !== "void"), [overview.fees]);
  const pendingFeeTotal = useMemo(() => pendingFees.reduce((total, fee) => total + (Number(fee.outstanding_amount ?? fee.fee_amount) || 0), 0), [pendingFees]);
  const kpis = [
    ["Active Dealers", activeAccounts.length],
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
      if (access.email.trim() && savedAccount.account_status === "active") {
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
      setNotice(access.email.trim() && savedAccount.account_status === "active" ? "Dealer saved and portal login linked." : savedAccount.account_status !== "active" ? "Dealer saved. Portal login access remains blocked until the account is active." : creating ? "Dealer portal account created." : "Dealer portal account updated.");
      setEditing(null);
      setAccess(emptyAccess);
      await load();
    } else setError(payload.error || "Unable to save dealer portal account.");
    setSaving(false);
  }

  async function setAccountStatus(account: DealerPortalAccountWithPreferences, accountStatus: DealerPortalAccount["account_status"]) {
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/dealer-portal/admin/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...account, account_status: accountStatus }),
    });
    const payload = await response.json();
    if (response.ok) {
      setNotice(`${account.trading_name} set to ${statusLabel(accountStatus)}.`);
      await load();
    } else setError(payload.error || "Unable to update dealer status.");
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

  return <main className="admin-page dealer-portal-admin-page">
    <div className="admin-heading"><div><h1>Dealer Portal</h1><p>Review leads and release direct claims or MotorGeeks dealer-offer opportunities.</p></div><div className="quick-actions"><Link href="/dealer-login" target="_blank">Dealer Login</Link><button className="admin-secondary" onClick={() => void backfillVehicleChecks()} disabled={backfilling}>{backfilling ? "Checking..." : "Run Missing Vehicle Checks"}</button><button className="admin-primary" onClick={() => startEditing(emptyAccount)}>Add Portal Dealer</button></div></div>
    <section className="website-kpis">{kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    {error && <div className="website-state error compact">{error}</div>}{notice && <div className="website-state success compact">{notice}</div>}
    <section className="dealer-admin-workspace">
      <nav className="dealer-admin-tabs" aria-label="Dealer portal admin sections">
        <button className={activeTab === "daily" ? "active" : ""} type="button" onClick={() => setActiveTab("daily")}><span>Lead Queue</span></button>
        <button className={activeTab === "dealers" ? "active" : ""} type="button" onClick={() => setActiveTab("dealers")}><span>Dealers</span><b>{accounts.length}</b></button>
        <button className={activeTab === "oversight" ? "active" : ""} type="button" onClick={() => setActiveTab("oversight")}><span>Oversight</span><b>{overview.claims.length + overview.purchases.length}</b></button>
      </nav>
      {activeTab === "daily" && <section className="dealer-admin-panel"><LeadBrowser queue dealers={activeAccounts} /></section>}
      {activeTab === "dealers" && <section className="dealer-admin-panel">
        <section className="website-detail-card dealer-portal-accounts">
          <header><div><h2>Portal Dealers</h2><p>Dealer accounts are hidden from the daily view to keep this page cleaner.</p></div><button className="admin-primary" onClick={() => startEditing(emptyAccount)}>Add Portal Dealer</button></header>
          {loading ? <p>Loading accounts...</p> : !accounts.length ? <p>No dealer portal accounts yet.</p> : <div className="dealer-status-groups">{(["pending", "active", "rejected", "suspended"] as const).map(group => <section key={group}><h3>{group === "active" ? "Active / Approved" : statusLabel(group)}</h3><div className="dealer-contact-grid">{groupedAccounts[group].length ? groupedAccounts[group].map(account => <DealerAccountCard account={account} saving={saving} onEdit={() => startEditing(account)} onStatus={status => void setAccountStatus(account, status)} key={account.id} />) : <p>No {group === "active" ? "approved" : group} dealer accounts.</p>}</div></section>)}</div>}
        </section>
      </section>}
      {activeTab === "oversight" && <section className="dealer-admin-panel">
        <section className="website-detail-card status-actions dealer-admin-oversight">
          <header><div><h2>Dealer Oversight</h2><p>Claims, notes, purchases and purchase fees in one place.</p></div></header>
          <div className="dealer-admin-overview-grid">
            <OverviewPanel title="Recent Claims" empty="No dealer claims yet.">{overview.claims.slice(0, 12).map(claim => <OverviewItem key={claim.id} title={`${claim.dealer?.trading_name || "Dealer"} claimed ${leadTitle(claim.lead)}`} meta={`${statusLabel(claim.status)} - ${formatLeadDate(claim.claimed_at)}`} href={`/website-leads/${claim.website_lead_id}`} />)}</OverviewPanel>
            <OverviewPanel title="Activity Notes" empty="No dealer activity yet.">{overview.notes.slice(0, 12).map(note => <OverviewItem key={note.id} title={`${note.dealer?.trading_name || "Dealer"} - ${note.note_type}`} meta={`${leadTitle(note.lead)} - ${formatLeadDate(note.created_at)}`} body={note.body} href={`/website-leads/${note.website_lead_id}`} />)}</OverviewPanel>
            <OverviewPanel title="Reported Purchases" empty="No dealer purchases reported yet.">{overview.purchases.slice(0, 12).map(purchase => <OverviewItem key={purchase.id} title={`${purchase.dealer?.trading_name || "Dealer"} - ${leadTitle(purchase.lead)}`} meta={`${money(purchase.purchase_price)} - ${formatLeadDate(purchase.reported_at)}`} body={purchase.purchase_type.replaceAll("_", " ")} href={`/website-leads/${purchase.website_lead_id}`} />)}</OverviewPanel>
            <OverviewPanel title="Successful Purchase Fees" empty="No purchase fees yet.">{overview.fees.slice(0, 12).map(fee => <FeeAdminItem fee={fee} onChanged={load} key={fee.id} />)}</OverviewPanel>
            <OverviewPanel title="Fee Ledger" empty="No fee ledger entries yet.">{overview.ledger.slice(0, 12).map(entry => <OverviewItem key={entry.id} title={`${entry.dealer?.trading_name || "Dealer"} - ${statusLabel(entry.entry_type)}`} meta={`${money(entry.amount)} - ${formatLeadDate(entry.created_at)}`} body={entry.note || undefined} href={`/website-leads/${entry.website_lead_id}`} />)}</OverviewPanel>
          </div>
        </section>
      </section>}
    </section>
    {editing && <DealerAccountModal editing={editing} access={access} saving={saving} setAccess={setAccess} setField={setField} setBuyingField={setBuyingField} setGeographyField={setGeographyField} onSubmit={saveAccount} onClose={() => { setEditing(null); setAccess(emptyAccess); }} />}
  </main>;
}

function DealerAccountCard({ account, saving, onEdit, onStatus }: { account: DealerPortalAccountWithPreferences; saving: boolean; onEdit: () => void; onStatus: (status: DealerPortalAccount["account_status"]) => void }) {
  return <article className="dealer-contact-card">
    <header><div><span>{account.account_status}</span><h2>{account.trading_name}</h2><p>{account.main_contact || "No main contact"} · {account.postcode || "Postcode not set"}</p></div><b>{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(account.successful_purchase_fee ?? 0))}</b></header>
    <dl><div><dt>Email</dt><dd>{account.main_email || "-"}</dd></div><div><dt>Phone</dt><dd>{account.telephone || account.mobile_whatsapp || "-"}</dd></div><div><dt>Submitted</dt><dd>{formatLeadDate(account.created_at)}</dd></div><div><dt>Website / reference</dt><dd>{account.website || account.autotrader_dealer_ref || "-"}</dd></div><div><dt>Address</dt><dd>{account.trading_address || account.registered_address || account.postcode || "-"}</dd></div><div><dt>Internal notes</dt><dd>{account.internal_notes || "-"}</dd></div></dl>
    <nav><button onClick={onEdit}>Edit / Login</button>{account.account_status !== "active" && <button disabled={saving} onClick={() => onStatus("active")}>Approve</button>}{account.account_status !== "rejected" && <button disabled={saving} onClick={() => onStatus("rejected")}>Reject</button>}{account.account_status !== "suspended" && <button disabled={saving} onClick={() => onStatus("suspended")}>Suspend</button>}</nav>
  </article>;
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
          {modalTab === "account" && <section className="dealer-modal-section"><h3><span>01</span>Dealer Account</h3><div className="dealer-modal-grid"><Input label="Trading name" value={editing.trading_name ?? ""} set={v => setField("trading_name", v)} required /><Input label="Limited company" value={editing.limited_company_name ?? ""} set={v => setField("limited_company_name", v)} /><Input label="Company reg" value={editing.company_registration_number ?? ""} set={v => setField("company_registration_number", v)} /><Input label="VAT number" value={editing.vat_number ?? ""} set={v => setField("vat_number", v)} /><Input label="Main contact" value={editing.main_contact ?? ""} set={v => setField("main_contact", v)} /><Input label="Main email" value={editing.main_email ?? ""} set={v => setField("main_email", v)} type="email" /><Input label="Telephone" value={editing.telephone ?? ""} set={v => setField("telephone", v)} /><Input label="WhatsApp/mobile" value={editing.mobile_whatsapp ?? ""} set={v => setField("mobile_whatsapp", v)} /><Input label="Accounts email" value={editing.accounts_email ?? ""} set={v => setField("accounts_email", v)} type="email" /><Input label="Website" value={editing.website ?? ""} set={v => setField("website", v)} /><Input label="Postcode" value={editing.postcode ?? ""} set={v => setField("postcode", v)} /><Input label="Auto Trader ref" value={editing.autotrader_dealer_ref ?? ""} set={v => setField("autotrader_dealer_ref", v)} /><label><span>Status</span><select value={editing.account_status ?? "pending"} onChange={event => setField("account_status", event.target.value)}><option value="pending">Pending</option><option value="active">Active</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select></label><Input label="Purchase fee" value={String(editing.successful_purchase_fee ?? 50)} set={v => setField("successful_purchase_fee", Number(v))} type="number" /><Input label="Attribution days" value={String(editing.attribution_period_days ?? 60)} set={v => setField("attribution_period_days", Number(v))} type="number" /><label className="full"><span>Trading address</span><textarea value={editing.trading_address ?? ""} onChange={event => setField("trading_address", event.target.value)} /></label><label className="full"><span>Registered address</span><textarea value={editing.registered_address ?? ""} onChange={event => setField("registered_address", event.target.value)} /></label><label className="full compact-notes"><span>Internal notes</span><textarea value={editing.internal_notes ?? ""} onChange={event => setField("internal_notes", event.target.value)} /></label></div></section>}
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

function OverviewPanel({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  return <section><h3>{title}</h3>{Children.count(children) ? <div>{children}</div> : <p>{empty}</p>}</section>;
}

function OverviewItem({ title, meta, body, href }: { title: string; meta: string; body?: string; href: string }) {
  return <article><div><b>{title}</b><span>{meta}</span>{body && <p>{body}</p>}</div><Link href={href}>Open</Link></article>;
}

function FeeAdminItem({ fee, onChanged }: { fee: AdminFee; onChanged: () => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [invoiceReference, setInvoiceReference] = useState(fee.invoice_reference ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const effective = Number(fee.fee_amount ?? 0) + Number(fee.adjustment_amount ?? 0) - Number(fee.credit_amount ?? 0);
  async function mutate(action: string, includeAmount = false) {
    setBusy(action);
    setMessage("");
    const response = await fetch(`/api/dealer-portal/admin/fees/${fee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, amount: includeAmount ? amount : undefined, invoice_reference: invoiceReference, note }),
    });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to update Successful Purchase Fee.");
    else {
      setAmount("");
      setNote("");
      setMessage("Fee updated.");
      await onChanged();
    }
    setBusy("");
  }
  return <article className="dealer-fee-admin-item">
    <div className="dealer-fee-admin-main">
      <b>{fee.dealer?.trading_name || "Dealer"} - {leadTitle(fee.lead)}</b>
      <span>{statusLabel(fee.status)} - Effective {money(effective)} - Paid {money(fee.paid_amount)} - Outstanding {money(fee.outstanding_amount)}</span>
      <p>Base {money(fee.fee_amount)} · Adjustments {money(fee.adjustment_amount)} · Credits {money(fee.credit_amount)}{fee.invoice_reference ? ` · Invoice ${fee.invoice_reference}` : ""}</p>
      {message && <p className={message.includes("Unable") || message.includes("unsupported") ? "error" : "success"}>{message}</p>}
    </div>
    <div className="dealer-fee-admin-controls">
      <input value={invoiceReference} onChange={event => setInvoiceReference(event.target.value)} placeholder="Invoice ref" aria-label="Invoice reference" />
      <input value={amount} onChange={event => setAmount(event.target.value)} placeholder="Amount" type="number" min="0" step="0.01" aria-label="Amount" />
      <input value={note} onChange={event => setNote(event.target.value)} placeholder="Staff note" aria-label="Staff note" />
      <button type="button" disabled={Boolean(busy)} onClick={() => void mutate("mark_invoiced")}>{busy === "mark_invoiced" ? "Saving..." : "Invoice"}</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => void mutate("record_payment", true)}>{busy === "record_payment" ? "Saving..." : "Payment"}</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => void mutate("apply_credit", true)}>{busy === "apply_credit" ? "Saving..." : "Credit"}</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => void mutate("apply_adjustment", true)}>{busy === "apply_adjustment" ? "Saving..." : "Adjustment"}</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => void mutate("void")}>{busy === "void" ? "Saving..." : "Void"}</button>
    </div>
    <Link href={`/website-leads/${fee.website_lead_id}`}>Open</Link>
  </article>;
}

function leadTitle(lead: RelatedLead | undefined) {
  if (!lead) return "Unknown lead";
  return `#${lead.id} ${lead.reg || "No reg"} ${[lead.year, lead.make, lead.model].filter(Boolean).join(" ")}`.trim();
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(value ?? 0) || 0);
}
