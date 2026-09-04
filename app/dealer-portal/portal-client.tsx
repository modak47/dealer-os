"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import { directionsUrl, googleMapsUrl, staticMapUrl } from "@/lib/location-ui";
import { dealerLostReasons } from "@/lib/dealer-portal-lifecycle";
import { createClient } from "@/lib/supabase/client";
import { combineLeadImages, customerName, formatGbp, formatLeadDate, formatMileage, safeNumber, statusLabel } from "@/lib/website-leads";
import type { DealerBuyingPreferences, DealerFeeLedgerEntry, DealerGeographyPreferences, DealerLeadClaimStatus, DealerMileageHistoryItem, DealerMotHistoryItem, DealerPortalAccount, DealerPortalAccountWithPreferences, DealerPortalUserRole, DealerPortalUserSummary, DealerPurchase, DealerPurchaseFee, DealerVisibleLead } from "@/types/dealer-portal";
import styles from "./dealer-portal-v3.module.css";

type PortalData = {
  dealer: DealerPortalAccountWithPreferences;
  role: DealerPortalUserRole;
  available: DealerVisibleLead[];
  claimed: DealerVisibleLead[];
};

type PortalTab = "available" | "active" | "purchased" | "lost" | "payments" | "account";
type LeadCardTab = "overview" | "location" | "check" | "mot" | "customer";
type DealerAccountFee = DealerPurchaseFee & { purchase?: Pick<DealerPurchase, "purchase_type" | "purchase_price" | "purchase_date" | "reported_at"> | null; lead?: { id: number; reg?: string | null; make?: string | null; model?: string | null; year?: string | null; mileage?: string | null } | null };
type DealerPaymentsPayload = { fees: DealerAccountFee[]; ledger: DealerFeeLedgerEntry[] };

const terminalStatuses = new Set(["purchased", "purchased_later", "lost", "returned_to_pool"]);
const lostReasons = dealerLostReasons;
const statusActions: [DealerLeadClaimStatus, string][] = [
  ["attempting_contact", "Attempting Contact"],
  ["contacted", "Contacted"],
  ["offer_made", "Offer Made"],
  ["negotiating", "Negotiating"],
  ["agreed_to_purchase", "Agreed"],
  ["collection_booked", "Collection Booked"],
];

export function DealerPortalClient() {
  const [data, setData] = useState<PortalData | null>(null);
  const [activeTab, setActiveTab] = useState<PortalTab>(() => {
    if (typeof window === "undefined") return "available";
    const section = new URLSearchParams(window.location.search).get("section");
    return isPortalTab(section) ? section : "available";
  });
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

  const activeLeads = useMemo(() => data?.claimed.filter(lead => !terminalStatuses.has(String(lead.portal_claim_status))) ?? [], [data]);
  const purchasedLeads = useMemo(() => data?.claimed.filter(lead => ["purchased", "purchased_later"].includes(String(lead.portal_claim_status))) ?? [], [data]);
  const lostLeads = useMemo(() => data?.claimed.filter(lead => ["lost", "returned_to_pool"].includes(String(lead.portal_claim_status))) ?? [], [data]);
  const leads = activeTab === "available" ? data?.available ?? [] : activeTab === "active" ? activeLeads : activeTab === "purchased" ? purchasedLeads : activeTab === "lost" ? lostLeads : [];

  async function signOut() {
    await createClient().auth.signOut();
    setData(null);
    setNotice("Signed out.");
  }

  if (loading) return <section className={`${styles.scope} dealer-portal-v3`}><div className="portal-empty"><h2>Loading portal...</h2></div></section>;
  if (!data) return <section className={`${styles.scope} dealer-portal-v3`}><div className="portal-empty"><h2>Dealer access unavailable</h2><p>Sign in with a linked dealer login, or ask YesMoto to set up your dealer account.</p><Link className="dealer-claim-button" href="/dealer-login">Go to Dealer Login</Link></div></section>;

  return <section className={`${styles.scope} dealer-portal-v3`}>
    <div className="dealer-shell">
      <DealerSidebar
        dealer={data.dealer}
        activeTab={activeTab}
        counts={{ available: data.available.length, active: activeLeads.length, purchased: purchasedLeads.length, lost: lostLeads.length }}
        onTab={setActiveTab}
      />
      <section className="dealer-main">
        <header className="dealer-mainbar">
          <div className="dealer-mainbar-account"><b>{dealerInitials(data.dealer.trading_name)}</b><strong>{data.dealer.trading_name}</strong></div>
        </header>
        <section className="dealer-welcome">
          <div>
            <h1>Welcome back, <strong>{data.dealer.trading_name}</strong></h1>
            <p>Claiming and contacting are free. A successful purchase fee is only due when you buy the motorcycle.</p>
          </div>
          <button className="dealer-sign-out" onClick={() => void signOut()}>Sign out</button>
        </section>
        {error && <div className="portal-message error">{error}</div>}{notice && <div className="portal-message">{notice}</div>}
        {activeTab === "account" ? <DealerAccountPanel dealer={data.dealer} role={data.role} onSaved={dealer => setData(current => current ? { ...current, dealer } : current)} /> : activeTab === "payments" ? <DealerPaymentsPanel /> : <>
          {!leads.length ? <div className="portal-empty"><h2>{emptyTitle(activeTab)}</h2><p>{emptyCopy(activeTab)}</p></div> : <section className="dealer-lead-grid">{leads.map(lead => <DealerLeadCard lead={lead} section={activeTab} key={`${activeTab}-${lead.id}`} />)}</section>}
        </>}
      </section>
    </div>
  </section>;
}

function isPortalTab(value: string | null): value is PortalTab {
  return value === "available" || value === "active" || value === "purchased" || value === "lost" || value === "payments" || value === "account";
}

function emptyTitle(tab: PortalTab) {
  if (tab === "available") return "No available motorcycles right now";
  if (tab === "purchased") return "No purchases reported yet";
  if (tab === "lost") return "No lost or returned leads yet";
  if (tab === "payments") return "No Successful Purchase Fees yet";
  return "No active motorcycles yet";
}

function emptyCopy(tab: PortalTab) {
  if (tab === "available") return "New suitable opportunities will appear here when YesMoto releases them.";
  if (tab === "purchased") return "Purchased motorcycles will appear here after you report them.";
  if (tab === "lost") return "Leads you mark as lost or returned will stay here for your records.";
  if (tab === "payments") return "Successful Purchase Fees and manual account history will appear here.";
  return "Claim a lead to unlock customer details and work the opportunity.";
}

function arrayText(value: string[] | null | undefined) {
  return (value ?? []).join(", ");
}

function splitArrayText(value: string) {
  return Array.from(new Set(value.split(",").map(item => item.trim()).filter(Boolean)));
}

function preferenceSummary(values: string[] | null | undefined, empty = "Any") {
  return values?.length ? values.join(", ") : empty;
}

function dealerInitials(name: string | null | undefined) {
  const parts = (name || "Dealer").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "D").toUpperCase();
}

function displayEngine(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  return /\bcc\b/i.test(text) ? text : `${text}cc`;
}

function DealerPaymentsPanel() {
  const [payload, setPayload] = useState<DealerPaymentsPayload>({ fees: [], ledger: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadPayments() {
      setLoading(true);
      const response = await fetch("/api/dealer-portal/payments", { cache: "no-store" });
      const data = await response.json();
      if (!active) return;
      if (response.ok) setPayload({ fees: data.fees ?? [], ledger: data.ledger ?? [] });
      else setMessage(data.error || "Unable to load payment history.");
      setLoading(false);
    }
    void loadPayments();
    return () => { active = false; };
  }, []);

  const totals = payload.fees.reduce((sum, fee) => ({
    fees: sum.fees + Number(fee.fee_amount ?? 0),
    credits: sum.credits + Number(fee.credit_amount ?? 0),
    adjustments: sum.adjustments + Number(fee.adjustment_amount ?? 0),
    invoiced: sum.invoiced + Number(fee.invoiced_amount ?? 0),
    paid: sum.paid + Number(fee.paid_amount ?? 0),
    outstanding: sum.outstanding + Number(fee.outstanding_amount ?? 0),
  }), { fees: 0, credits: 0, adjustments: 0, invoiced: 0, paid: 0, outstanding: 0 });

  return <section className="dealer-payments-panel">
    <header><div><span>Account</span><h2>Successful Purchase Fees</h2><p>Read-only account history for purchases reported through the YesMoto dealer portal.</p></div></header>
    {message && <p className="dealer-work-error">{message}</p>}
    <section className="dealer-payment-summary">
      <Detail label="Outstanding" value={formatGbp(totals.outstanding)} />
      <Detail label="Invoiced" value={formatGbp(totals.invoiced)} />
      <Detail label="Paid" value={formatGbp(totals.paid)} />
      <Detail label="Credits" value={formatGbp(totals.credits)} />
      <Detail label="Fee total" value={formatGbp(totals.fees)} />
      <Detail label="Adjustments" value={formatGbp(totals.adjustments)} />
    </section>
    {loading ? <div className="portal-empty"><h2>Loading account history...</h2></div> : !payload.fees.length ? <div className="portal-empty"><h2>No Successful Purchase Fees yet</h2><p>Fees appear only after a motorcycle is reported as purchased.</p></div> : <section className="dealer-payment-grid">
      <div className="dealer-payment-card-list">
        <h3>Transactions</h3>
        {payload.fees.map(fee => <article className="dealer-payment-card" key={fee.id}>
          <header><div><b>{paymentLeadTitle(fee.lead)}</b><span>{statusLabel(fee.status)} · {formatLeadDate(fee.created_at)}</span></div><strong>{formatGbp(fee.outstanding_amount)} outstanding</strong></header>
          <dl>
            <Detail label="Successful Purchase Fee" value={formatGbp(fee.fee_amount)} />
            <Detail label="Effective charge" value={formatGbp(Number(fee.fee_amount ?? 0) + Number(fee.adjustment_amount ?? 0) - Number(fee.credit_amount ?? 0))} />
            <Detail label="Paid" value={formatGbp(fee.paid_amount)} />
            <Detail label="Invoice" value={fee.invoice_reference || "Not invoiced yet"} />
            <Detail label="Purchase date" value={fee.purchase?.purchase_date ?? null} />
            <Detail label="Purchase price" value={fee.purchase ? formatGbp(fee.purchase.purchase_price) : null} />
          </dl>
          {fee.notes && <p>{fee.notes}</p>}
        </article>)}
      </div>
      <div className="dealer-payment-ledger">
        <h3>Ledger History</h3>
        {!payload.ledger.length ? <p>No ledger entries yet.</p> : payload.ledger.map(entry => <article key={entry.id}><b>{statusLabel(entry.entry_type)}</b><span>{formatGbp(entry.amount)} · {formatLeadDate(entry.created_at)}</span>{entry.note && <p>{entry.note}</p>}</article>)}
      </div>
    </section>}
  </section>;
}

function paymentLeadTitle(lead: DealerAccountFee["lead"]) {
  if (!lead) return "Motorcycle purchase";
  return `#${lead.id} ${lead.reg || "No reg"} ${[lead.year, lead.make, lead.model].filter(Boolean).join(" ")}`.trim();
}

function DealerSidebar({ dealer, activeTab, counts, onTab }: { dealer: DealerPortalAccountWithPreferences; activeTab: PortalTab; counts: { available: number; active: number; purchased: number; lost: number }; onTab: (tab: PortalTab) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const items: { tab: PortalTab; label: string; count?: number; icon: string }[] = [
    { tab: "available", label: "Available Leads", count: counts.available, icon: "A" },
    { tab: "active", label: "Active Leads", count: counts.active, icon: "T" },
    { tab: "purchased", label: "Purchased", count: counts.purchased, icon: "P" },
    { tab: "lost", label: "Lost / Returned", count: counts.lost, icon: "R" },
  ];
  function selectTab(tab: PortalTab) {
    setMoreOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tab === "available") url.searchParams.delete("section");
      else url.searchParams.set("section", tab);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    onTab(tab);
  }
  const mobilePrimaryItems: { tab: PortalTab; label: string; count?: number; icon: string }[] = [
    { tab: "available", label: "Available", count: counts.available, icon: "A" },
    { tab: "active", label: "Active", count: counts.active, icon: "T" },
    { tab: "purchased", label: "Purchased", count: counts.purchased, icon: "P" },
  ];
  const mobileMoreItems: { tab?: PortalTab; label: string; count?: number; icon: string; disabled?: boolean; activeOnly?: PortalTab }[] = [
    { tab: "lost", label: "Lost / Returned", count: counts.lost, icon: "R" },
    { tab: "payments", label: "Payments", icon: "F" },
    { tab: "account", label: "Profile & Settings", icon: "S" },
    { label: "Support", icon: "?", disabled: true },
    { tab: "available", label: "Dashboard", icon: "D", activeOnly: undefined },
  ];
  const mobileMoreActive = ["lost", "payments", "account"].includes(activeTab);
  return <aside className="dealer-sidebar">
    <div className="dealer-sidebar-brand"><span>{dealerInitials(dealer.trading_name)}</span><div><strong>{dealer.trading_name}</strong><b>Dealer Portal</b></div></div>
    <nav className="dealer-desktop-nav" aria-label="Dealer portal navigation">
      <button type="button" onClick={() => selectTab("available")}><i>D</i><span>Dashboard</span></button>
      {items.map(item => <button className={activeTab === item.tab ? "active" : ""} type="button" onClick={() => selectTab(item.tab)} key={item.tab}><i>{item.icon}</i><span>{item.label}</span><b>{item.count}</b></button>)}
      <hr />
      <button className={activeTab === "payments" ? "active" : ""} type="button" onClick={() => selectTab("payments")}><i>F</i><span>Payments</span></button>
      <button className={activeTab === "account" ? "active" : ""} type="button" onClick={() => selectTab("account")}><i>S</i><span>Profile & Settings</span></button>
      <button type="button" aria-disabled="true"><i>?</i><span>Support</span></button>
    </nav>
    <nav className="dealer-mobile-nav" aria-label="Dealer portal mobile navigation">
      {mobilePrimaryItems.map(item => <button className={activeTab === item.tab ? "active" : ""} type="button" onClick={() => selectTab(item.tab)} key={item.tab}><i>{item.icon}</i><span>{item.label}</span><b>{item.count}</b></button>)}
      <button className={mobileMoreActive ? "active" : ""} type="button" onClick={() => setMoreOpen(open => !open)} aria-expanded={moreOpen} aria-haspopup="menu"><i>+</i><span>More</span></button>
      {moreOpen && <div className="dealer-mobile-more-menu" role="menu">
        {mobileMoreItems.map(item => item.disabled ? <button type="button" aria-disabled="true" role="menuitem" key={item.label}><i>{item.icon}</i><span>{item.label}</span></button> : <button className={item.activeOnly && activeTab === item.activeOnly ? "active" : ""} type="button" role="menuitem" onClick={() => item.tab && selectTab(item.tab)} key={item.label}><i>{item.icon}</i><span>{item.label}</span>{item.count != null && <b>{item.count}</b>}</button>)}
      </div>}
    </nav>
    <section className="dealer-sidebar-fee"><span>Purchase Fee</span><strong>{formatGbp(dealer.successful_purchase_fee ?? 50)}</strong><p>Only charged when a lead is purchased.</p></section>
  </aside>;
}

function accountBuyingDefaults(dealer: DealerPortalAccountWithPreferences): DealerBuyingPreferences {
  return dealer.buying_preferences ?? {
    dealer_account_id: dealer.id,
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

function accountGeographyDefaults(dealer: DealerPortalAccountWithPreferences): DealerGeographyPreferences {
  return dealer.geography_preferences ?? {
    dealer_account_id: dealer.id,
    england: true,
    wales: true,
    scotland: false,
    northern_ireland: false,
    republic_of_ireland: false,
    maximum_radius_miles: null,
  };
}

function DealerAccountPanel({ dealer, role, onSaved }: { dealer: DealerPortalAccountWithPreferences; role: DealerPortalUserRole; onSaved: (dealer: DealerPortalAccountWithPreferences) => void }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [users, setUsers] = useState<DealerPortalUserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<DealerPortalUserRole>("dealer_user");
  const canManageAccount = role === "dealer_admin";
  const [form, setForm] = useState(() => ({
    trading_address: dealer.trading_address ?? "",
    main_contact: dealer.main_contact ?? "",
    telephone: dealer.telephone ?? "",
    mobile_whatsapp: dealer.mobile_whatsapp ?? "",
    main_email: dealer.main_email ?? "",
    accounts_email: dealer.accounts_email ?? "",
    website: dealer.website ?? "",
    postcode: dealer.postcode ?? "",
  }));
  const [buying, setBuying] = useState(() => accountBuyingDefaults(dealer));
  const [geography, setGeography] = useState(() => accountGeographyDefaults(dealer));

  useEffect(() => {
    if (!canManageAccount) return;
    void loadUsers();
  }, [canManageAccount]);

  async function loadUsers() {
    setUsersLoading(true);
    const response = await fetch("/api/dealer-portal/users", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setUsers(payload.users ?? []);
    else setMessage(payload.error || "Unable to load dealership users.");
    setUsersLoading(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageAccount) {
      setMessage("Dealer Admin access is required to update account settings.");
      return;
    }
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/dealer-portal/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, buying_preferences: buying, geography_preferences: geography }),
    });
    const payload = await response.json();
    if (response.ok) {
      onSaved(payload.dealer as DealerPortalAccountWithPreferences);
      setMessage("Account preferences saved.");
    } else setMessage(payload.error || "Unable to save account preferences.");
    setSaving(false);
  }

  async function inviteUser() {
    if (!canManageAccount) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/dealer-portal/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail, role: userRole }),
    });
    const payload = await response.json();
    if (response.ok) {
      setUserEmail("");
      setUserRole("dealer_user");
      setMessage(payload.invited ? "Dealer user invited." : "Dealer user linked.");
      await loadUsers();
    } else setMessage(payload.error || "Unable to invite dealership user.");
    setSaving(false);
  }

  async function updateUser(id: string, updates: Partial<Pick<DealerPortalUserSummary, "role" | "active">>) {
    if (!canManageAccount) return;
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/dealer-portal/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const payload = await response.json();
    if (response.ok) {
      setMessage("Dealer user updated.");
      await loadUsers();
    } else setMessage(payload.error || "Unable to update dealership user.");
    setSaving(false);
  }

  function setFormField(key: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [key]: value }));
  }
  function setBuyingField<K extends keyof DealerBuyingPreferences>(key: K, value: DealerBuyingPreferences[K]) {
    setBuying(current => ({ ...current, [key]: value }));
  }
  function setGeographyField<K extends keyof DealerGeographyPreferences>(key: K, value: DealerGeographyPreferences[K]) {
    setGeography(current => ({ ...current, [key]: value }));
  }

  return <form className="dealer-account-panel" onSubmit={save}>
    <header><div><span>Dealer Account</span><h2>{dealer.trading_name}</h2><p>{canManageAccount ? "Keep your buying profile current so YesMoto can release the right opportunities." : "Your account and buying profile are read-only. Ask your Dealer Admin to update dealership settings."}</p></div>{canManageAccount && <button disabled={saving}>{saving ? "Saving..." : "Save Account"}</button>}</header>
    {message && <p className={message.includes("Unable") ? "dealer-work-error" : "dealer-work-success"}>{message}</p>}
    <section className="dealer-account-summary">
      <Detail label="Company" value={dealer.limited_company_name || dealer.trading_name} />
      <Detail label="Company reg" value={dealer.company_registration_number} />
      <Detail label="VAT number" value={dealer.vat_number} />
      <Detail label="Purchase fee" value={formatGbp(dealer.successful_purchase_fee)} />
      <Detail label="Attribution period" value={`${dealer.attribution_period_days} days`} />
      <Detail label="Status" value={statusLabel(dealer.account_status)} />
      <Detail label="Makes wanted" value={preferenceSummary(buying.makes_wanted)} />
      <Detail label="Buying radius" value={geography.maximum_radius_miles == null ? "No limit set" : `${geography.maximum_radius_miles} miles`} />
    </section>
    <section className="dealer-account-grid">
      <div className="dealer-account-card">
        <h3>Company Details</h3>
        <dl className="dealer-staff-controlled-fields">
          <Detail label="Trading name" value={dealer.trading_name} />
          <Detail label="Legal company" value={dealer.limited_company_name} />
          <Detail label="Registered address" value={dealer.registered_address} />
          <Detail label="Auto Trader ref" value={dealer.autotrader_dealer_ref} />
        </dl>
        <div className="dealer-form-grid">
          <Input label="Main contact" value={form.main_contact} set={value => setFormField("main_contact", value)} disabled={!canManageAccount} />
          <Input label="Main email" value={form.main_email} set={value => setFormField("main_email", value)} type="email" disabled={!canManageAccount} />
          <Input label="Telephone" value={form.telephone} set={value => setFormField("telephone", value)} disabled={!canManageAccount} />
          <Input label="WhatsApp/mobile" value={form.mobile_whatsapp} set={value => setFormField("mobile_whatsapp", value)} disabled={!canManageAccount} />
          <Input label="Accounts email" value={form.accounts_email} set={value => setFormField("accounts_email", value)} type="email" disabled={!canManageAccount} />
          <Input label="Website" value={form.website} set={value => setFormField("website", value)} disabled={!canManageAccount} />
          <Input label="Postcode" value={form.postcode} set={value => setFormField("postcode", value)} disabled={!canManageAccount} />
          <label className="full"><span>Trading address</span><textarea value={form.trading_address} disabled={!canManageAccount} onChange={event => setFormField("trading_address", event.target.value)} /></label>
        </div>
      </div>
      <div className="dealer-account-card">
        <h3>Buying Preferences</h3>
        <div className="dealer-form-grid">
          <TextListInput label="Types" value={buying.motorcycle_types} set={value => setBuyingField("motorcycle_types", value)} placeholder="Roadster, adventure, scooter" disabled={!canManageAccount} />
          <TextListInput label="Makes wanted" value={buying.makes_wanted} set={value => setBuyingField("makes_wanted", value)} placeholder="Honda, Yamaha, KTM" disabled={!canManageAccount} />
          <TextListInput label="Makes excluded" value={buying.makes_excluded} set={value => setBuyingField("makes_excluded", value)} disabled={!canManageAccount} />
          <TextListInput label="Models wanted" value={buying.models_wanted} set={value => setBuyingField("models_wanted", value)} disabled={!canManageAccount} />
          <NumberPreference label="Minimum year" value={buying.minimum_year} set={value => setBuyingField("minimum_year", value)} disabled={!canManageAccount} />
          <NumberPreference label="Maximum age years" value={buying.maximum_age_years} set={value => setBuyingField("maximum_age_years", value)} disabled={!canManageAccount} />
          <NumberPreference label="Minimum value" value={buying.minimum_value} set={value => setBuyingField("minimum_value", value)} disabled={!canManageAccount} />
          <NumberPreference label="Maximum value" value={buying.maximum_value} set={value => setBuyingField("maximum_value", value)} disabled={!canManageAccount} />
          <NumberPreference label="Maximum mileage" value={buying.maximum_mileage} set={value => setBuyingField("maximum_mileage", value)} disabled={!canManageAccount} />
          <NumberPreference label="Minimum engine cc" value={buying.minimum_engine_cc} set={value => setBuyingField("minimum_engine_cc", value)} disabled={!canManageAccount} />
          <NumberPreference label="Maximum engine cc" value={buying.maximum_engine_cc} set={value => setBuyingField("maximum_engine_cc", value)} disabled={!canManageAccount} />
        </div>
      </div>
      <div className="dealer-account-card">
        <h3>History Rules</h3>
        <div className="dealer-checklist">
          <Checkbox label="Accept non-running bikes" checked={buying.accepts_non_running} set={value => setBuyingField("accepts_non_running", value)} disabled={!canManageAccount} />
          <Checkbox label="Accept insurance category bikes" checked={buying.accepts_insurance_category} set={value => setBuyingField("accepts_insurance_category", value)} disabled={!canManageAccount} />
          <Checkbox label="Accept outstanding finance marker" checked={buying.accepts_outstanding_finance} set={value => setBuyingField("accepts_outstanding_finance", value)} disabled={!canManageAccount} />
          <Checkbox label="Accept imported bikes" checked={buying.accepts_imported} set={value => setBuyingField("accepts_imported", value)} disabled={!canManageAccount} />
          <Checkbox label="Accept modified bikes" checked={buying.accepts_modified} set={value => setBuyingField("accepts_modified", value)} disabled={!canManageAccount} />
        </div>
      </div>
      <div className="dealer-account-card">
        <h3>Geography</h3>
        <div className="dealer-checklist geography">
          <Checkbox label="England" checked={geography.england} set={value => setGeographyField("england", value)} disabled={!canManageAccount} />
          <Checkbox label="Wales" checked={geography.wales} set={value => setGeographyField("wales", value)} disabled={!canManageAccount} />
          <Checkbox label="Scotland" checked={geography.scotland} set={value => setGeographyField("scotland", value)} disabled={!canManageAccount} />
          <Checkbox label="Northern Ireland" checked={geography.northern_ireland} set={value => setGeographyField("northern_ireland", value)} disabled={!canManageAccount} />
          <Checkbox label="Republic of Ireland" checked={geography.republic_of_ireland} set={value => setGeographyField("republic_of_ireland", value)} disabled={!canManageAccount} />
        </div>
        <NumberPreference label="Buying radius miles" value={geography.maximum_radius_miles} set={value => setGeographyField("maximum_radius_miles", value)} disabled={!canManageAccount} />
      </div>
    </section>
    {canManageAccount && <section className="dealer-account-card dealer-user-management">
      <h3>Dealership Users</h3>
      <div className="dealer-user-invite">
        <Input label="Email" value={userEmail} set={setUserEmail} type="email" required />
        <label><span>Role</span><select value={userRole} onChange={event => setUserRole(event.target.value === "dealer_admin" ? "dealer_admin" : "dealer_user")}><option value="dealer_user">Dealer User</option><option value="dealer_admin">Dealer Admin</option></select></label>
        <button type="button" disabled={saving || !userEmail.trim()} onClick={() => void inviteUser()}>{saving ? "Saving..." : "Invite User"}</button>
      </div>
      {usersLoading ? <p>Loading users...</p> : <div className="dealer-user-list">{users.map(user => <article key={user.id}>
        <div><strong>{user.email || "Email not available"}</strong><span>{user.active ? "Active" : "Inactive"} - {user.role === "dealer_admin" ? "Dealer Admin" : "Dealer User"}</span></div>
        <select value={user.role} disabled={saving} onChange={event => void updateUser(user.id, { role: event.target.value === "dealer_admin" ? "dealer_admin" : "dealer_user" })}><option value="dealer_user">Dealer User</option><option value="dealer_admin">Dealer Admin</option></select>
        <button type="button" disabled={saving || !user.active} onClick={() => void updateUser(user.id, { active: false })}>Deactivate</button>
      </article>)}</div>}
    </section>}
  </form>;
}

function DealerLeadCard({ lead, section }: { lead: DealerVisibleLead; section: PortalTab }) {
  const router = useRouter();
  const [imageIndex, setImageIndex] = useState(0);
  const images = lead.resolved_images ?? combineLeadImages(lead);
  const image = images[imageIndex] ?? images[0];
  const unlocked = Boolean(lead.customer_unlocked);
  const notes = lead.portal_notes ?? [];
  const title = [lead.year, lead.make, lead.model].filter(Boolean).join(" ") || "Motorcycle details pending";
  const askingPrice = safeNumber(lead.price);
  const displayStatus = statusLabel(lead.portal_claim_status || lead.status || "available").replace(/^Dealer Pool Available$/i, "Available");
  const href = `/dealer-portal/leads/${lead.id}?from=${section}`;
  const cardMode = unlocked ? String(lead.portal_claim_status || "claimed").replace(/_/g, "-") : "available";
  const latestNote = notes[0] ?? null;
  const latestOffer = notes.find(note => note.note_type === "offer") ?? null;
  const check = lead.portal_vehicle_check;
  const checkNeedsReview = check?.clear === false || check?.flags.some(item => item.state === "warning");
  const outcomeDate = lead.portal_claim_status === "lost" ? lead.portal_notes?.find(note => note.note_type === "status")?.created_at : latestNote?.created_at;
  const cardDetails = unlocked ? compactClaimedDetails(lead, latestNote, latestOffer, outcomeDate) : [
    ["Mileage", formatMileage(lead.mileage) || "Mileage pending"],
    ["Location", lead.portal_location_label || "Location pending"],
    ["Asking", askingPrice === null ? lead.price || "Price not supplied" : `${formatGbp(askingPrice)} asking`],
  ];
  function moveImage(direction: -1 | 1) {
    setImageIndex(current => (current + direction + images.length) % images.length);
  }
  function openLead() {
    router.push(href);
  }
  return <article className={`dealer-lead-card dealer-lead-card-${cardMode}`} role="link" tabIndex={0} onClick={openLead} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openLead(); } }}>
    <DealerPhotoGallery images={images} image={image} imageIndex={imageIndex} title={title} make={lead.make} model={lead.model} onMove={moveImage} onSelect={setImageIndex} onOpen={openLead} />
    <div className="dealer-lead-body">
      <header className="dealer-lead-title"><span>{displayStatus}</span><h2>{title}</h2><p>{lead.reg || "Registration pending"}</p></header>
      <dl className="dealer-card-facts">{cardDetails.map(([label, value]) => <Detail label={label} value={value} key={label} />)}</dl>
      {!unlocked && <p className={`dealer-card-check ${checkNeedsReview ? "warning" : "clear"}`}>{checkNeedsReview ? "Vehicle check needs review" : "Vehicle check clear"}</p>}
    </div>
  </article>;
}

function compactClaimedDetails(lead: DealerVisibleLead, latestNote: NonNullable<DealerVisibleLead["portal_notes"]>[number] | null, latestOffer: NonNullable<DealerVisibleLead["portal_notes"]>[number] | null, outcomeDate: string | null | undefined) {
  if (["purchased", "purchased_later"].includes(String(lead.portal_claim_status))) return [
    ["Reg", lead.reg || "Reg pending"],
    ["Purchased", formatLeadDate(outcomeDate || lead.updated_at || lead.created_at)],
    ["Status", statusLabel(lead.portal_claim_status || "purchased")],
    ["Fee", "See account"],
  ];
  if (["lost", "returned_to_pool"].includes(String(lead.portal_claim_status))) return [
    ["Reg", lead.reg || "Reg pending"],
    ["Outcome", statusLabel(lead.portal_claim_status || "lost")],
    ["Reason", lead.portal_lost_reason || "Not supplied"],
    ["Date", formatLeadDate(outcomeDate || lead.updated_at || lead.created_at)],
  ];
  return [
    ["Customer", customerName(lead)],
    ["Workflow", statusLabel(lead.portal_claim_status || "claimed")],
    ["Latest offer", latestOffer?.body || "No offer recorded"],
    ["Last activity", latestNote ? formatLeadDate(latestNote.created_at) : "No activity yet"],
  ];
}

export function LeadWorkspaceClient({ leadId }: { leadId: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [tab, setTab] = useState<LeadCardTab>(() => {
    if (typeof window === "undefined") return "overview";
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    return isLeadWorkspaceTab(requestedTab) ? requestedTab : "overview";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const from = typeof window === "undefined" ? "available" : new URLSearchParams(window.location.search).get("from");
  const backSection = isLeadListTab(from) ? from : "available";

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/dealer-portal/leads", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setData(payload);
    else setError(payload.error || "Unable to load this lead.");
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function restoreTabFromUrl() {
      const requestedTab = new URLSearchParams(window.location.search).get("tab");
      setTab(isLeadWorkspaceTab(requestedTab) ? requestedTab : "overview");
    }
    window.addEventListener("popstate", restoreTabFromUrl);
    return () => window.removeEventListener("popstate", restoreTabFromUrl);
  }, []);

  const lead = useMemo(() => {
    const id = Number(leadId);
    if (!data || !Number.isFinite(id)) return null;
    return [...data.available, ...data.claimed].find(item => item.id === id) ?? null;
  }, [data, leadId]);

  async function claimLead() {
    if (!lead) return;
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/dealer-portal/leads/${lead.id}/claim`, { method: "POST" });
    const payload = await response.json();
    if (response.ok) {
      setNotice("Lead claimed. Customer details are now unlocked.");
      setWorkspaceTab("customer");
      await load();
    } else setError(payload.error || "Unable to claim lead.");
    setBusy(false);
  }

  function setWorkspaceTab(nextTab: LeadCardTab) {
    setTab(nextTab);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (nextTab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", nextTab);
    window.history.pushState({}, "", url);
  }

  if (loading) return <section className={`${styles.scope} dealer-portal-v3`}><div className="dealer-workspace-loading" role="status" aria-live="polite"><span aria-hidden="true" /><p>Loading opportunity...</p></div></section>;
  if (!data) return <section className={`${styles.scope} dealer-portal-v3`}><div className="dealer-lead-workspace"><div className="portal-empty"><h2>Dealer access unavailable</h2><p>Sign in with a linked dealer login, or ask YesMoto to set up your dealer account.</p><Link className="dealer-claim-button" href="/dealer-login">Go to Dealer Login</Link></div></div></section>;
  if (!lead) return <section className={`${styles.scope} dealer-portal-v3`}><div className="dealer-lead-workspace"><a className="dealer-workspace-back" href={`/dealer-portal${backSection === "available" ? "" : `?section=${backSection}`}`}>Back to Opportunities</a><div className="portal-empty"><h2>Lead not available</h2><p>This opportunity is not currently available to your dealership, or it has moved out of your authorised portal records.</p></div></div></section>;

  return <LeadWorkspace dealer={data.dealer} lead={lead} tab={tab} from={backSection} busy={busy} notice={notice} error={error} setTab={setWorkspaceTab} onClaim={() => void claimLead()} onChanged={load} />;
}

function isLeadListTab(value: string | null): value is Exclude<PortalTab, "payments" | "account"> {
  return value === "available" || value === "active" || value === "purchased" || value === "lost";
}

function isLeadWorkspaceTab(value: string | null): value is LeadCardTab {
  return value === "overview" || value === "location" || value === "check" || value === "mot" || value === "customer";
}

function LeadWorkspace({ dealer, lead, tab, from, busy, notice, error, setTab, onClaim, onChanged }: { dealer: DealerPortalAccountWithPreferences; lead: DealerVisibleLead; tab: LeadCardTab; from: Exclude<PortalTab, "payments" | "account">; busy: boolean; notice: string; error: string; setTab: (tab: LeadCardTab) => void; onClaim: () => void; onChanged: () => Promise<void> }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [previewImageIndex, setPreviewImageIndex] = useState<number | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const images = lead.resolved_images ?? combineLeadImages(lead);
  const image = images[imageIndex] ?? images[0];
  const previewImage = previewImageIndex == null ? null : images[previewImageIndex] ?? null;
  const title = [lead.year, lead.make, lead.model].filter(Boolean).join(" ") || "Motorcycle details pending";
  const meta = [lead.reg, formatMileage(lead.mileage), displayEngine(lead.engine)].filter(Boolean).join(" - ");
  const locationSummary = [lead.portal_location_label, lead.portal_distance_label?.replace(" from your dealership", " away")].filter(Boolean).join(" - ");
  const unlocked = Boolean(lead.customer_unlocked);
  const claimId = lead.portal_claim_id ?? "";
  const active = unlocked && claimId && !terminalStatuses.has(String(lead.portal_claim_status));
  const canReportPurchasedLater = unlocked && claimId && lead.portal_claim_status === "lost";
  const latestNote = lead.portal_notes?.[0] ?? null;
  const latestOffer = lead.portal_notes?.find(note => note.note_type === "offer") ?? null;
  const askingPrice = safeNumber(lead.price);
  const displayStatus = statusLabel(lead.portal_claim_status || lead.status || "available").replace(/^Dealer Pool Available$/i, "Available");
  const tabs: [LeadCardTab, string][] = [["overview", "Overview"], ["check", "Vehicle Check"], ["mot", "MOT & Mileage"], ["location", "Location"], ...(unlocked ? [["customer", "Customer / Work Lead"] as [LeadCardTab, string]] : [])];
  const activeTab = tab === "customer" && !unlocked ? "overview" : tab;

  function moveImage(direction: -1 | 1) {
    if (!images.length) return;
    setImageIndex(current => (current + direction + images.length) % images.length);
  }
  function openPreviewImage(index: number) {
    setPhotoZoom(1);
    setPreviewImageIndex(index);
  }
  const movePreviewImage = useCallback((direction: -1 | 1) => {
    if (!images.length) return;
    setPhotoZoom(1);
    setPreviewImageIndex(current => ((current ?? imageIndex) + direction + images.length) % images.length);
  }, [imageIndex, images.length]);
  const updatePhotoZoom = useCallback((nextZoom: number) => {
    setPhotoZoom(Math.min(3, Math.max(1, nextZoom)));
  }, []);
  function togglePhotoZoom() {
    setPhotoZoom(current => current > 1 ? 1 : 2);
  }
  useEffect(() => {
    if (previewImageIndex == null) return;
    function handlePhotoKeys(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewImageIndex(null);
      if (event.key === "ArrowLeft") movePreviewImage(-1);
      if (event.key === "ArrowRight") movePreviewImage(1);
      if (event.key === "+" || event.key === "=") updatePhotoZoom(photoZoom + .5);
      if (event.key === "-") updatePhotoZoom(photoZoom - .5);
      if (event.key === "0") setPhotoZoom(1);
    }
    document.addEventListener("keydown", handlePhotoKeys);
    return () => document.removeEventListener("keydown", handlePhotoKeys);
  }, [previewImageIndex, images.length, movePreviewImage, updatePhotoZoom, photoZoom]);

  return <section className={`${styles.scope} dealer-portal-v3`}>
    <main className="dealer-lead-workspace">
      <a className="dealer-workspace-back" href={`/dealer-portal${from === "available" ? "" : `?section=${from}`}`}>Back to Opportunities</a>
      {error && <div className="portal-message error">{error}</div>}{notice && <div className="portal-message">{notice}</div>}
      <header className="dealer-workspace-hero">
        <DealerPhotoGallery images={images} image={image} imageIndex={imageIndex} title={title} make={lead.make} model={lead.model} onMove={moveImage} onSelect={setImageIndex} onOpen={openPreviewImage} />
        <div className="dealer-workspace-title">
          <span>{displayStatus}</span>
          <h1>{title}</h1>
          {meta && <p>{meta}</p>}
          {unlocked && locationSummary && <p>{locationSummary}</p>}
        </div>
        <aside className="dealer-workspace-price">
          <span>Customer asking</span>
          <strong>{askingPrice === null ? lead.price || "Not supplied" : formatGbp(askingPrice)}</strong>
          {!unlocked && <button className="dealer-claim-button" type="button" disabled={busy} onClick={onClaim}>{busy ? "Claiming..." : "Claim Lead"}</button>}
          {unlocked && <b>{statusLabel(lead.portal_claim_status || "claimed")}</b>}
        </aside>
      </header>
      <LeadWorkspaceMetrics lead={lead} unlocked={unlocked} latestNote={latestNote} latestOffer={latestOffer} />
      <nav className="dealer-workspace-tabs" aria-label={`${title} detail sections`}>
        {tabs.map(([value, label]) => <button className={activeTab === value ? "active" : ""} type="button" onClick={() => setTab(value)} key={value}>{label}</button>)}
      </nav>
      <section className="dealer-workspace-content">
        {activeTab === "overview" && <MotorcyclePreviewPanel lead={lead} />}
        {activeTab === "location" && <LocationPanel dealer={dealer} lead={lead} unlocked={unlocked} />}
        {activeTab === "check" && <VehicleCheckPanel lead={lead} />}
        {activeTab === "mot" && <VehicleMotPanel lead={lead} />}
        {activeTab === "customer" && <><section className="dealer-customer-work-grid"><CustomerPanel lead={lead} unlocked />{active && <DealerWorkPanel claimId={claimId} lead={lead} onChanged={onChanged} />}{canReportPurchasedLater && <PurchasedLaterPanel claimId={claimId} lead={lead} onChanged={onChanged} />}</section><section className="dealer-timeline"><h3>Activity Timeline</h3>{lead.portal_notes?.length ? lead.portal_notes.map(note => <article key={note.id}><span>{note.note_type} - {formatLeadDate(note.created_at)}</span><p>{note.body}</p></article>) : <p>No activity recorded yet.</p>}</section></>}
      </section>
    </main>
    {previewImage && <div className="dealer-v3-photo-modal" role="dialog" aria-modal="true" aria-label={`${title} photo`}>
      <button className="dealer-v3-modal-backdrop" type="button" aria-label="Close photo preview" onClick={() => setPreviewImageIndex(null)} />
      <section>
        <div className="dealer-v3-photo-modal-head">
          <span>Photo {previewImageIndex == null ? 1 : previewImageIndex + 1} of {images.length}</span>
          <div className="dealer-v3-photo-tools" aria-label="Photo zoom controls">
            <button type="button" onClick={() => updatePhotoZoom(photoZoom - .5)} disabled={photoZoom <= 1} aria-label="Zoom out">-</button>
            <button type="button" onClick={() => setPhotoZoom(1)} disabled={photoZoom === 1}>Reset</button>
            <button type="button" onClick={() => updatePhotoZoom(photoZoom + .5)} disabled={photoZoom >= 3} aria-label="Zoom in">+</button>
          </div>
          <button type="button" onClick={() => setPreviewImageIndex(null)}>Close</button>
        </div>
        {images.length > 1 && <><button className="dealer-v3-photo-nav previous" type="button" onClick={() => movePreviewImage(-1)} aria-label="Previous enlarged photo">&lt;</button><button className="dealer-v3-photo-nav next" type="button" onClick={() => movePreviewImage(1)} aria-label="Next enlarged photo">&gt;</button></>}
        <button className={`dealer-v3-photo-zoom ${photoZoom > 1 ? "zoomed" : ""}`} type="button" onClick={togglePhotoZoom} aria-label={photoZoom > 1 ? "Reset photo zoom" : "Zoom photo"}>
          <img src={previewImage} alt={`${lead.make ?? "Motorcycle"} ${lead.model ?? ""}`} style={{ transform: `scale(${photoZoom})` } as CSSProperties} />
        </button>
      </section>
    </div>}
  </section>;
}

function LeadWorkspaceMetrics({ lead, unlocked, latestNote, latestOffer }: { lead: DealerVisibleLead; unlocked: boolean; latestNote: NonNullable<DealerVisibleLead["portal_notes"]>[number] | null; latestOffer: NonNullable<DealerVisibleLead["portal_notes"]>[number] | null }) {
  const check = lead.portal_vehicle_check;
  const motLabel = check?.mot_expiry || lead.mot || "Not supplied";
  const checkLabel = check?.clear === false ? "Needs review" : check?.clear === true ? "Clear" : check?.status || "Not available";
  const rows = unlocked ? [
    ["Customer", customerName(lead)],
    ["Status", statusLabel(lead.portal_claim_status || "claimed")],
    ["Latest offer", latestOffer?.body || "No offer recorded"],
    ["Last activity", latestNote ? formatLeadDate(latestNote.created_at) : "No activity yet"],
  ] : [
    ["Location / distance", [lead.portal_location_label, lead.portal_distance_label?.replace(" from your dealership", " away")].filter(Boolean).join(" - ") || "Location pending"],
    ["MOT", motLabel],
    ["Vehicle check", checkLabel],
  ];
  return <section className="dealer-workspace-metrics">{rows.map(([label, value]) => <Detail label={label} value={value} key={label} />)}</section>;
}

function DealerPhotoGallery({ images, image, imageIndex, title, make, model, onMove, onSelect, onOpen }: { images: string[]; image: string | undefined; imageIndex: number; title: string; make: string | null | undefined; model: string | null | undefined; onMove: (direction: -1 | 1) => void; onSelect: (index: number) => void; onOpen?: (index: number) => void }) {
  function movePhoto(event: MouseEvent<HTMLButtonElement>, direction: -1 | 1) {
    event.stopPropagation();
    onMove(direction);
  }
  function selectPhoto(event: MouseEvent<HTMLButtonElement>, index: number) {
    event.stopPropagation();
    onSelect(index);
  }
  function openPhoto(event: MouseEvent<HTMLButtonElement>) {
    if (!onOpen) return;
    event.stopPropagation();
    onOpen(imageIndex);
  }
  return <div className={`dealer-lead-image ${image ? "" : "no-photo"}`}>
    {image ? <button className="dealer-image-open" type="button" onClick={openPhoto} aria-label={onOpen ? `Open ${title} photo` : `Open ${title}`}>
      <img src={image} alt={`${make ?? "Motorcycle"} ${model ?? ""}`} />
    </button> : <span><i aria-hidden="true">+</i><b>No photos supplied</b></span>}
    {images.length > 1 && <>
      <button className="dealer-image-nav previous" type="button" onClick={event => movePhoto(event, -1)} aria-label="Previous motorcycle photo">&lt;</button>
      <button className="dealer-image-nav next" type="button" onClick={event => movePhoto(event, 1)} aria-label="Next motorcycle photo">&gt;</button>
      <div className="dealer-image-dots" aria-label={`${imageIndex + 1} of ${images.length} photos`}>
        {images.map((_, index) => <button className={index === imageIndex ? "active" : ""} type="button" onClick={event => selectPhoto(event, index)} aria-label={`Show photo ${index + 1}`} key={index} />)}
      </div>
      <b>{imageIndex + 1} / {images.length} photos</b>
    </>}
  </div>;
}

function MotorcyclePreviewPanel({ lead }: { lead: DealerVisibleLead }) {
  const sellerComments = lead.customer_message || lead.extras;
  const rows = [
    ["Registration", lead.reg],
    ["Mileage", formatMileage(lead.mileage)],
    ["Make", lead.make],
    ["Model", lead.model],
    ["Year", lead.year],
    ["Engine", lead.engine],
    ["Colour", lead.colour],
    ["Owners", lead.owners],
    ["Service history", lead.service || lead.history],
    ["MOT", lead.mot],
    ["Condition", lead.bike_condition || lead.damage],
  ] as const;
  return <section className="dealer-preview-panel">
    <h3>Bike Details</h3>
    <dl>{rows.map(([label, value]) => <Detail label={label} value={value} key={label} />)}</dl>
    {sellerComments && <div className="dealer-seller-comments"><span>Seller comments</span><p>{sellerComments}</p></div>}
  </section>;
}

function CustomerPanel({ lead, unlocked }: { lead: DealerVisibleLead; unlocked: boolean }) {
  return <section className={`dealer-customer-panel ${unlocked ? "unlocked" : ""}`}>
    <h3>{unlocked ? "Customer Details" : "Customer Details Locked"}</h3>
    {unlocked ? <dl><div><dt>Name</dt><dd>{customerName(lead)}</dd></div><div><dt>Phone</dt><dd>{lead.phone ? <a className="dealer-contact-action" href={`tel:${lead.phone}`}>Call {lead.phone}</a> : "Not supplied"}</dd></div><div className="dealer-customer-email"><dt>Email</dt><dd>{lead.email ? <a className="dealer-contact-action" href={`mailto:${lead.email}`}>Email <span>{lead.email}</span></a> : "Not supplied"}</dd></div><div><dt>Postcode</dt><dd>{lead.postcode || "Not supplied"}</dd></div></dl> : <p>Claim this lead to unlock customer contact details. Only one dealer can claim each lead.</p>}
  </section>;
}

function LocationPanel({ dealer, lead, unlocked }: { dealer: DealerPortalAccount; lead: DealerVisibleLead; unlocked: boolean }) {
  const publicLocation = {
    location_town: lead.location_town || lead.portal_location_label,
    location_display_name: unlocked ? lead.location_display_name : null,
    postcode: unlocked ? lead.postcode : null,
    normalised_postcode: unlocked ? lead.normalised_postcode : null,
    latitude: unlocked ? lead.latitude : null,
    longitude: unlocked ? lead.longitude : null,
  };
  const mapUrl = staticMapUrl(publicLocation);
  const hasLocation = Boolean(publicLocation.location_town || publicLocation.location_display_name || publicLocation.postcode || publicLocation.latitude != null);
  const dealerOrigin = dealer.postcode || dealer.trading_name || "YesMoto";
  const forceFallback = process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("map") === "fallback";
  const [failedMapUrl, setFailedMapUrl] = useState<string | null>(null);

  const showFallback = forceFallback || !mapUrl || failedMapUrl === mapUrl;

  return <section className="dealer-location-panel">
    <div className={`dealer-map-preview ${showFallback ? "fallback" : "loaded"}`}>
      {mapUrl && !showFallback && <iframe title="Approximate motorcycle location map" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" onError={() => setFailedMapUrl(mapUrl)} />}
      {showFallback && <div className="dealer-map-fallback">
        <strong>Map unavailable</strong>
        <p>Approximate location shown using the information provided.</p>
      </div>}
    </div>
    <div>
      <h3>Location</h3>
      <dl>
        <Detail label="Motorcycle" value={lead.portal_location_label || "Approximate location pending"} />
        <Detail label="Your dealership" value={dealer.postcode || "Dealer postcode not set"} />
        <Detail label="Distance" value={lead.portal_distance_label || "Distance not calculated"} />
      </dl>
      {hasLocation && <nav><a href={googleMapsUrl(publicLocation)} target="_blank" rel="noreferrer">View Map</a><a href={directionsUrl(dealerOrigin, publicLocation)} target="_blank" rel="noreferrer">Directions</a></nav>}
    </div>
  </section>;
}

function VehicleCheckPanel({ lead, compact = false }: { lead: DealerVisibleLead; compact?: boolean }) {
  const check = lead.portal_vehicle_check;
  const compactFlagKeys = new Set(["identity", "stolen", "finance", "write_off", "mileage"]);
  const compactWarningKeys = new Set(["scrapped", "imported", "exported", "high_risk"]);
  const priorityFlags = check?.flags.filter(item => compactFlagKeys.has(item.key) || (compactWarningKeys.has(item.key) && item.state === "warning")) ?? [];
  const flags = (compact ? priorityFlags : check?.flags ?? []).filter(item => !(item.key === "mot" && check?.mot_expiry));
  const reportHref = check?.report_url ? `/api/autotrader/vehicle-check-report?url=${encodeURIComponent(check.report_url)}` : "";
  return <section className={`dealer-vehicle-check ${compact ? "compact" : ""} ${check?.clear === false ? "warning" : check?.clear === true ? "clear" : ""}`}>
    <header><div><span>Vehicle Check</span><h3>{check?.status || "Vehicle check not yet available"}</h3></div><nav>{check?.mot_expiry && <b>MOT {check.mot_expiry}</b>}{reportHref && <a href={reportHref} target="_blank" rel="noreferrer">View report</a>}</nav></header>
    {!check ? <p>Vehicle check not yet available. YesMoto will show the HPI-style summary here once the Auto Trader vehicle check has been stored.</p> : <><div className="dealer-check-grid">{flags.map(item => <DealerCheckResult state={item.state} label={item.label} detail={item.detail} key={item.key} />)}</div>{check.details.length > 0 && !compact && <details className="dealer-check-details"><summary>Technical identity details</summary><dl>{check.details.map(item => <Detail label={item.label} value={item.value} key={item.label} />)}</dl></details>}</>}
  </section>;
}

function DealerCheckResult({ state, label, detail }: { state: string; label: string; detail: string }) {
  const status = state === "warning" ? "Attention" : state === "clear" ? "OK" : "Unknown";
  return <article className={`dealer-check-result ${state}`}>
    <b aria-label={status}>{state === "warning" ? "!" : state === "clear" ? "OK" : "?"}</b>
    <div><strong>{label}</strong><span>{detail}</span></div>
    <em>{status}</em>
  </article>;
}

function VehicleMotPanel({ lead }: { lead: DealerVisibleLead }) {
  const check = lead.portal_vehicle_check;
  return <section className="dealer-vehicle-check dealer-mot-panel">
    <header><div><span>MOT data</span><h3>{check ? `MOT History${lead.reg ? ` - ${lead.reg}` : ""}` : "MOT data not yet available"}</h3></div></header>
    {!check ? <p>MOT and mileage history will show here once the Auto Trader vehicle check has been stored.</p> : <MotReportPanel check={check} lead={lead} />}
  </section>;
}

function MotReportPanel({ check, lead }: { check: NonNullable<DealerVisibleLead["portal_vehicle_check"]>; lead: DealerVisibleLead }) {
  const motHistory = check.mot_history ?? [];
  const mileageHistory = check.mileage_history ?? [];
  const fallbackMotDetails = fallbackMotAdvisoryDetails(lead.mot);
  return <div className="dealer-mot-report">
    {mileageHistory.length > 0 && <MileageGraph history={mileageHistory} />}
    <section className="dealer-mot-tests">
      <h4>MOT Tests ({motHistory.length})</h4>
      {!motHistory.length ? <p>Historic MOT records are not available from the stored vehicle check yet.</p> : <div className="dealer-mot-report-list">{motHistory.slice(0, 8).map((item, index) => <MotReportRow item={item} extraDetails={index === 0 ? fallbackMotDetails : []} expanded={index === 0} key={`${item.date}-${index}`} />)}</div>}
      <p className="dealer-history-note">Data sourced from the stored MOT history service.</p>
    </section>
  </div>;
}

function MileageGraph({ history }: { history: DealerMileageHistoryItem[] }) {
  const orderedHistory = [...history].sort((a, b) => motDateTime(b.date) - motDateTime(a.date) || b.mileage - a.mileage);
  const mileages = orderedHistory.map(item => item.mileage);
  const max = Math.max(...mileages);
  const deltas = orderedHistory.map((item, index) => {
    const previousReading = orderedHistory[index + 1]?.mileage;
    return previousReading == null ? null : item.mileage - previousReading;
  });
  return <div className="dealer-mileage-report">
    {orderedHistory.map((item, index) => {
      const width = Math.max(18, (item.mileage / Math.max(1, max)) * 100);
      const delta = deltas[index];
      const year = String(item.date || "").slice(0, 4) || item.source;
      return <div className="dealer-mileage-report-row" title={`${item.source}: ${item.mileage.toLocaleString("en-GB")} miles`} key={`${item.date}-${index}`}>
        <span>{year}</span>
        <i><b style={{ width: `${width}%` }} /></i>
        <strong>{item.mileage.toLocaleString("en-GB")}</strong>
        <em>{delta == null ? "" : `+${delta.toLocaleString("en-GB")}`}</em>
      </div>;
    })}
  </div>;
}

function MotReportRow({ item, expanded, extraDetails = [] }: { item: DealerMotHistoryItem; expanded: boolean; extraDetails?: string[] }) {
  const label = item.status === "pass" ? "PASS" : item.status === "fail" ? "FAIL" : "UNKNOWN";
  const mileage = item.mileage == null ? "Mileage not supplied" : `${item.mileage.toLocaleString("en-GB")} MI`;
  const testDate = formatMotDate(item.date);
  const expiryDate = formatMotDate(item.expiry);
  const details = [...item.details, ...extraDetails.filter(detail => !item.details.some(existing => existing.toLowerCase() === detail.toLowerCase()))];
  return <details className={`dealer-mot-report-test ${item.status}`} open={expanded}>
    <summary>
      <span><b>{label}</b>{details.length > 0 && <em>{details.length} item{details.length === 1 ? "" : "s"}</em>}</span>
      <small>{testDate}</small>
      <small>{mileage}</small>
    </summary>
    <div className="dealer-mot-report-detail">
      <dl>
        <Detail label="Test date" value={testDate} />
        <Detail label="Valid until" value={expiryDate} />
        <Detail label="Mileage" value={item.mileage == null ? null : `${item.mileage.toLocaleString("en-GB")} MI (read)`} />
      </dl>
      {details.length > 0 && <div><strong>Advisories</strong><ul>{details.map(detail => <li key={detail}>{detail}</li>)}</ul></div>}
    </div>
  </details>;
}

function fallbackMotAdvisoryDetails(value: string | null | undefined) {
  if (!value || !/(advis|fail|worn|noisy|exhaust|chain|tyre|brake|corrosion)/i.test(value)) return [];
  const withoutMotPrefix = value
    .replace(/^mot\s*[:\-]?\s*/i, "")
    .replace(/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*/i, "")
    .trim();
  if (!withoutMotPrefix || /^\d{1,2}\s+\w+\s+\d{4}$/i.test(withoutMotPrefix)) return [];
  return [withoutMotPrefix];
}

function formatMotDate(value: string | null | undefined) {
  if (!value) return "Date not returned";
  const parsed = parseMotDate(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function motDateTime(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = parseMotDate(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseMotDate(value: string) {
  const trimmed = value.trim();
  const ukDate = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (ukDate) {
    const year = Number(ukDate[3]) < 100 ? 2000 + Number(ukDate[3]) : Number(ukDate[3]);
    return new Date(year, Number(ukDate[2]) - 1, Number(ukDate[1]));
  }
  return new Date(trimmed);
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div><dt>{label}</dt><dd>{value == null || value === "" ? "Not supplied" : value}</dd></div>;
}

function DealerWorkPanel({ claimId, lead, onChanged }: { claimId: string; lead: DealerVisibleLead; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [noteBody, setNoteBody] = useState("");
  const [lostReason, setLostReason] = useState<string>(lostReasons[0]);
  const [lostReasonDetail, setLostReasonDetail] = useState("");
  const [purchase, setPurchase] = useState(() => ({
    purchase_price: String(safeNumber(lead.price) ?? ""),
    purchase_date: new Date().toISOString().slice(0, 10),
    collection_date: "",
    mileage_at_purchase: String(safeNumber(lead.mileage) ?? ""),
    notes: "",
  }));

  async function updateStatus(status: DealerLeadClaimStatus, extra: Record<string, unknown> = {}) {
    setBusy(status);
    setMessage("");
    const response = await fetch(`/api/dealer-portal/claims/${claimId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to update status.");
    else {
      setMessage("Status updated.");
      await onChanged();
    }
    setBusy("");
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("note");
    setMessage("");
    const response = await fetch(`/api/dealer-portal/claims/${claimId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_type: noteType, body: noteBody }),
    });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to add note.");
    else {
      setNoteBody("");
      setMessage("Note added.");
      await onChanged();
    }
    setBusy("");
  }

  async function reportPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("purchase");
    setMessage("");
    const response = await fetch(`/api/dealer-portal/claims/${claimId}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(purchase),
    });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to report purchase.");
    else {
      setMessage("Purchase reported and Successful Purchase Fee created.");
      await onChanged();
    }
    setBusy("");
  }

  return <section className="dealer-work-panel">
    <h3>Work Lead</h3>
    {message && <p className={message.includes("Unable") ? "dealer-work-error" : "dealer-work-success"}>{message}</p>}
    <div className="dealer-status-actions">{statusActions.map(([status, label]) => <button type="button" disabled={Boolean(busy)} onClick={() => void updateStatus(status)} key={status}>{label}</button>)}</div>
    <form className="dealer-note-form" onSubmit={addNote}>
      <select value={noteType} onChange={event => setNoteType(event.target.value)}><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="offer">Offer</option></select>
      <textarea value={noteBody} onChange={event => setNoteBody(event.target.value)} placeholder="Add activity note, offer, call outcome or next step" required />
      <button disabled={Boolean(busy)}>{busy === "note" ? "Adding..." : "Add Note"}</button>
    </form>
    <details className="dealer-outcome-panel"><summary>Lost / Return</summary><div><select value={lostReason} onChange={event => setLostReason(event.target.value)}>{lostReasons.map(reason => <option key={reason}>{reason}</option>)}</select>{lostReason === "Other" && <input value={lostReasonDetail} onChange={event => setLostReasonDetail(event.target.value)} placeholder="Brief reason" />}<button type="button" disabled={Boolean(busy)} onClick={() => void updateStatus("lost", { lost_reason: lostReason, lost_reason_detail: lostReasonDetail })}>Mark Lost</button><button type="button" disabled={Boolean(busy)} onClick={() => void updateStatus("returned_to_pool")}>Return to Pool</button></div></details>
    <details className="dealer-outcome-panel"><summary>Report Purchase</summary><form onSubmit={reportPurchase}><Input label="Purchase price" value={purchase.purchase_price} set={value => setPurchase(current => ({ ...current, purchase_price: value }))} type="number" required /><Input label="Purchase date" value={purchase.purchase_date} set={value => setPurchase(current => ({ ...current, purchase_date: value }))} type="date" required /><Input label="Collection date" value={purchase.collection_date} set={value => setPurchase(current => ({ ...current, collection_date: value }))} type="date" /><Input label="Mileage" value={purchase.mileage_at_purchase} set={value => setPurchase(current => ({ ...current, mileage_at_purchase: value }))} type="number" /><label className="full"><span>Notes</span><textarea value={purchase.notes} onChange={event => setPurchase(current => ({ ...current, notes: event.target.value }))} /></label><button disabled={Boolean(busy)}>{busy === "purchase" ? "Reporting..." : "Mark as Purchased"}</button></form></details>
  </section>;
}

function PurchasedLaterPanel({ claimId, lead, onChanged }: { claimId: string; lead: DealerVisibleLead; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [purchase, setPurchase] = useState(() => ({
    purchase_price: String(safeNumber(lead.price) ?? ""),
    purchase_date: new Date().toISOString().slice(0, 10),
    collection_date: "",
    mileage_at_purchase: String(safeNumber(lead.mileage) ?? ""),
    notes: "",
  }));

  async function reportPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/dealer-portal/claims/${claimId}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(purchase),
    });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to report later purchase.");
    else {
      setMessage("Purchased Later reported and Successful Purchase Fee created.");
      await onChanged();
    }
    setBusy(false);
  }

  return <section className="dealer-work-panel purchased-later-panel">
    <h3>Customer Came Back - Purchased</h3>
    <p>This records the purchase as a later outcome from the original YesMoto introduction.</p>
    {message && <p className={message.includes("Unable") ? "dealer-work-error" : "dealer-work-success"}>{message}</p>}
    <form className="dealer-later-purchase-form" onSubmit={reportPurchase}>
      <Input label="Purchase price" value={purchase.purchase_price} set={value => setPurchase(current => ({ ...current, purchase_price: value }))} type="number" required />
      <Input label="Purchase date" value={purchase.purchase_date} set={value => setPurchase(current => ({ ...current, purchase_date: value }))} type="date" required />
      <Input label="Collection date" value={purchase.collection_date} set={value => setPurchase(current => ({ ...current, collection_date: value }))} type="date" required />
      <Input label="Mileage" value={purchase.mileage_at_purchase} set={value => setPurchase(current => ({ ...current, mileage_at_purchase: value }))} type="number" required />
      <label className="full"><span>Notes</span><textarea value={purchase.notes} onChange={event => setPurchase(current => ({ ...current, notes: event.target.value }))} placeholder="Briefly explain what happened after the lead was marked lost." required /></label>
      <button disabled={busy}>{busy ? "Reporting..." : "Report Purchased Later"}</button>
    </form>
  </section>;
}

function Input({ label, value, set, type = "text", required = false, disabled = false }: { label: string; value: string; set: (value: string) => void; type?: string; required?: boolean; disabled?: boolean }) {
  return <label><span>{label}</span><input type={type} value={value} required={required} disabled={disabled} min={type === "number" ? "0" : undefined} onChange={event => set(event.target.value)} /></label>;
}

function TextListInput({ label, value, set, placeholder = "", disabled = false }: { label: string; value: string[]; set: (value: string[]) => void; placeholder?: string; disabled?: boolean }) {
  return <label><span>{label}</span><input value={arrayText(value)} placeholder={placeholder} disabled={disabled} onChange={event => set(splitArrayText(event.target.value))} /></label>;
}

function NumberPreference({ label, value, set, disabled = false }: { label: string; value: number | null; set: (value: number | null) => void; disabled?: boolean }) {
  return <label><span>{label}</span><input type="number" min="0" value={value ?? ""} disabled={disabled} onChange={event => set(event.target.value === "" ? null : Number(event.target.value))} /></label>;
}

function Checkbox({ label, checked, set, disabled = false }: { label: string; checked: boolean; set: (value: boolean) => void; disabled?: boolean }) {
  return <label><input type="checkbox" checked={checked} disabled={disabled} onChange={event => set(event.target.checked)} /><span>{label}</span></label>;
}
