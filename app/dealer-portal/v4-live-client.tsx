"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { directionsUrl, googleMapsUrl, staticMapUrl } from "@/lib/location-ui";
import { dealerLostReasons } from "@/lib/dealer-portal-lifecycle";
import { createClient } from "@/lib/supabase/client";
import { combineLeadImages, customerName, formatGbp, formatLeadDate, formatMileage, safeNumber, statusLabel } from "@/lib/website-leads";
import type { DealerBuyingPreferences, DealerFeeLedgerEntry, DealerGeographyPreferences, DealerLeadClaimStatus, DealerLeadNote, DealerMileageHistoryItem, DealerMotHistoryItem, DealerPortalAccount, DealerPortalAccountWithPreferences, DealerPortalUserRole, DealerPortalUserSummary, DealerPurchase, DealerPurchaseFee, DealerVisibleLead } from "@/types/dealer-portal";
import styles from "@/app/dealer-v4-preview/v4-preview.module.css";

type PortalData = {
  dealer: DealerPortalAccountWithPreferences;
  role: DealerPortalUserRole;
  available: DealerVisibleLead[];
  claimed: DealerVisibleLead[];
};
type PortalStatus = {
  accountStatus?: DealerPortalAccount["account_status"];
  dealer?: Pick<DealerPortalAccount, "id" | "trading_name" | "main_email"> | null;
  error?: string;
};

type PortalSection = "dashboard" | "opportunities" | "active" | "purchased" | "lost" | "payments" | "dealership" | "settings" | "support";
type LeadTab = "overview" | "vehicle-check" | "mot" | "location" | "customer";
type DealerAccountFee = DealerPurchaseFee & { purchase?: Pick<DealerPurchase, "purchase_type" | "purchase_price" | "purchase_date" | "reported_at"> | null; lead?: { id: number; reg?: string | null; make?: string | null; model?: string | null; year?: string | null; mileage?: string | null } | null };
type DealerPaymentsPayload = { fees: DealerAccountFee[]; ledger: DealerFeeLedgerEntry[] };

const terminalStatuses = new Set(["purchased", "purchased_later", "lost", "returned_to_pool"]);
const lostReasons = dealerLostReasons;
const workStatuses: [DealerLeadClaimStatus, string][] = [
  ["attempting_contact", "Attempting Contact"],
  ["contacted", "Contacted"],
  ["offer_made", "Offer Made"],
  ["negotiating", "Negotiating"],
  ["agreed_to_purchase", "Agreed"],
  ["collection_booked", "Collection Booked"],
];

export function DealerLoginV4Live({ configured }: { configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("dealeros-login-email");
      if (saved) setEmail(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setMessage("Authentication is not configured yet.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const cleanEmail = email.trim();
      const { error } = await createClient().auth.signInWithPassword({ email: cleanEmail, password });
      if (error) throw error;
      if (rememberEmail) window.localStorage.setItem("dealeros-login-email", cleanEmail);
      else window.localStorage.removeItem("dealeros-login-email");
      const next = searchParams.get("next");
      router.replace(isSafeDealerNext(next) ? next! : "/dealer-portal");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    if (!configured || !email.trim()) {
      setMessage("Enter your email address first.");
      return;
    }
    setLoading(true);
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dealer-portal")}` });
    setLoading(false);
    setMessage(error ? error.message : "Password reset email sent.");
  }

  return <main className={styles.loginPage}>
    <section className={styles.loginHero}>
      <Link className={styles.loginBack} href="/">← Back to website</Link>
      <div className={styles.loginCopy}>
        <MotorGeeksLogo />
        <h1>Dealer access to quality motorcycle <span>opportunities</span></h1>
        <p>Join a network of verified motorcycle dealers and get access to genuine seller opportunities across the UK.</p>
        <ul><li><MotorGeeksTick />Real seller enquiries</li><li><MotorGeeksTick />High quality, verified motorcycles</li><li><MotorGeeksTick />A simple, secure platform</li></ul>
      </div>
      <p className={styles.scribble}>The right bikes. The right buyers.</p>
    </section>
    <section className={styles.loginLower}>
      <form className={styles.loginCard} onSubmit={submit}>
        <h2>Dealer login</h2>
        <p>Log in to access your MotorGeeks dealer portal.</p>
        <label className={styles.field}>Email address<input value={email} onChange={event => setEmail(event.target.value)} placeholder="yourname@dealership.co.uk" type="email" autoComplete="email" required disabled={!configured || loading} /></label>
        <label className={`${styles.field} ${styles.password}`}>Password<input value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" type="password" autoComplete="current-password" required disabled={!configured || loading} /><span>◉</span></label>
        <div className={styles.loginOptions}>
          <label><input type="checkbox" checked={rememberEmail} onChange={event => setRememberEmail(event.target.checked)} disabled={loading} /> Remember me</label>
          <button type="button" onClick={resetPassword} disabled={!configured || loading}>Forgot password?</button>
        </div>
        {message && <p className={message.includes("sent") ? styles.successMessage : styles.errorMessage}>{message}</p>}
        <button className={styles.orangeButton} type="submit" disabled={!configured || loading}>{loading ? "Logging in..." : "Log in →"}</button>
        <div className={styles.divider}>or</div>
        <a className={styles.outlineButton} href="mailto:support@motorgeeks.co.uk?subject=Dealer%20access%20request">Request dealer access →</a>
        <a className={styles.loginNetwork} href="mailto:support@motorgeeks.co.uk?subject=Dealer%20access%20request">Not a dealer yet? Join our verified dealer network</a>
      </form>
      <aside className={styles.benefitColumn}>
        <Benefit icon={<ShieldIcon />} title="Verified dealer network">All dealers are reviewed and approved before access is granted.</Benefit>
        <Benefit icon={<ChartIcon />} title="Genuine opportunities">Access real seller motorcycle enquiries, not duplicated or low quality leads.</Benefit>
        <Benefit icon={<LockIcon />} title="Secure and confidential">Your account and all data is protected with industry standard security.</Benefit>
        <Benefit icon={<SupportIcon />} title="Support when you need it">Our team is here to help if you have any questions.</Benefit>
        <div className={styles.quote}><p>MotorGeeks dealer access is available to approved motorcycle dealers only.</p></div>
        <p className={`${styles.scribble} ${styles.lowerScribble}`}>More opportunities ahead.</p>
      </aside>
    </section>
  </main>;
}

export function DealerPortalV4Live({ section = "dashboard" }: { section?: PortalSection }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [status, setStatus] = useState<PortalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/dealer-portal/leads", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      setData(payload);
      setStatus(null);
    } else {
      setData(null);
      setStatus(response.status === 403 ? payload : null);
      setError(payload.error || "Unable to load dealer portal.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function signOut() {
    await createClient().auth.signOut();
    setData(null);
    setNotice("Signed out.");
  }

  if (loading) return <V4Loading label="Loading dealer portal..." />;
  if (!data) return <DealerUnavailable error={error} status={status} />;

  const active = activeLeads(data.claimed);
  const purchased = purchasedLeads(data.claimed);
  const lost = lostLeads(data.claimed);

  return <DealerV4Shell dealer={data.dealer} section={section} counts={{ available: data.available.length, active: active.length, purchased: purchased.length, lost: lost.length }} onSignOut={signOut}>
    {notice && <p className={styles.successMessage}>{notice}</p>}
    {section === "dashboard" && <Dashboard data={data} active={active} purchased={purchased} lost={lost} />}
    {section === "opportunities" && <OpportunityList leads={data.available} title="Opportunities" subtitle="Motorcycles currently available to your dealership." empty="No available opportunities right now." />}
    {section === "active" && <LeadList leads={active} section="active" title="Active Leads" subtitle="Claimed opportunities currently being worked by your dealership." />}
    {section === "purchased" && <LeadList leads={purchased} section="purchased" title="Purchased" subtitle="Purchase history and Successful Purchase Fee states." />}
    {section === "lost" && <LeadList leads={lost} section="lost" title="Lost / Returned" subtitle="A useful history of outcomes, return reasons and purchased-later records." />}
    {section === "payments" && <PaymentsPanel />}
    {section === "dealership" && <DealershipPanel dealer={data.dealer} />}
    {section === "settings" && <SettingsPanel dealer={data.dealer} role={data.role} onSaved={dealer => setData(current => current ? { ...current, dealer } : current)} />}
    {section === "support" && <SupportPanel />}
  </DealerV4Shell>;
}

export function DealerLeadWorkspaceV4Live({ leadId }: { leadId: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [status, setStatus] = useState<PortalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<LeadTab>(() => {
    if (typeof window === "undefined") return "overview";
    const tab = new URLSearchParams(window.location.search).get("tab");
    return isLeadTab(tab) ? tab : "overview";
  });
  const tabsRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/dealer-portal/leads", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      setData(payload);
      setStatus(null);
    } else {
      setData(null);
      setStatus(response.status === 403 ? payload : null);
      setError(payload.error || "Unable to load this opportunity.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const lead = useMemo(() => {
    const id = Number(leadId);
    if (!data || !Number.isFinite(id)) return null;
    return [...data.available, ...data.claimed].find(item => Number(item.id) === id) ?? null;
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
      setActiveTab("customer");
      await load();
    } else setError(payload.error || "Unable to claim lead.");
    setBusy(false);
  }

  function selectTab(tab: LeadTab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    const positionTabs = () => {
      const tabs = tabsRef.current;
      if (!tabs) return;
      const topbar = document.querySelector<HTMLElement>("[data-dealer-topbar='true']");
      const topbarHeight = topbar?.getBoundingClientRect().height ?? 0;
      let absoluteTop = 0;
      let element: HTMLElement | null = tabs;
      while (element) {
        absoluteTop += element.offsetTop;
        element = element.offsetParent as HTMLElement | null;
      }
      const desiredTop = absoluteTop - topbarHeight - 8;
      window.scrollTo({ top: Math.max(0, desiredTop), behavior: "auto" });
    };
    positionTabs();
    requestAnimationFrame(() => requestAnimationFrame(positionTabs));
    window.setTimeout(positionTabs, 80);
  }

  if (loading) return <V4Loading label="Loading opportunity..." />;
  if (!data) return <DealerUnavailable error={error} status={status} />;
  if (!lead) return <DealerV4Shell dealer={data.dealer} section="opportunities" counts={shellCounts(data)}><section className={styles.dashboard}><Link className={styles.breadcrumb} href="/dealer-portal/opportunities">← Back to opportunities</Link><EmptyPanel title="Lead not available" copy="This opportunity is not currently available to your dealership, or it has moved out of your authorised portal records." /></section></DealerV4Shell>;

  return <DealerV4Shell dealer={data.dealer} section="opportunities" counts={shellCounts(data)}>
    <LeadWorkspaceView dealer={data.dealer} lead={lead} activeTab={activeTab} tabsRef={tabsRef} busy={busy} error={error} notice={notice} onClaim={() => void claimLead()} onSelectTab={selectTab} onChanged={load} />
  </DealerV4Shell>;
}

function Dashboard({ data, active, purchased, lost }: { data: PortalData; active: DealerVisibleLead[]; purchased: DealerVisibleLead[]; lost: DealerVisibleLead[] }) {
  const latest = data.available.slice(0, 5);
  const recentNotes = data.claimed.flatMap(lead => (lead.portal_notes ?? []).map(note => ({ note, lead }))).sort((a, b) => String(b.note.created_at).localeCompare(String(a.note.created_at))).slice(0, 4);
  return <section className={styles.dashboard}>
    <div className={styles.dashboardHeader}>
      <div><h1>Welcome back, {data.dealer.trading_name}</h1><p>Here&apos;s what&apos;s happening with your opportunities.</p></div>
      <span className={styles.dashboardDate}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
    </div>
    <section className={styles.metrics}>
      <Metric icon={<DocIcon />} value={String(data.available.length)} label="Available opportunities" detail="matched to your dealership" />
      <Metric icon={<ClockIcon />} value={String(active.length)} label="Active leads" detail="currently being worked" />
      <Metric icon={<CheckIcon />} value={String(purchased.length)} label="Purchased" detail="reported purchases" />
      <Metric icon={<ReturnIcon />} value={String(lost.length)} label="Lost / Returned" detail="historic outcomes" />
    </section>
    <section className={styles.dashboardOpportunitySplit}>
      <Panel title="Latest opportunities" linkHref="/dealer-portal/opportunities" link="View all opportunities →">
        <OpportunityRows leads={latest} compact />
      </Panel>
      <Panel title="Active lead pipeline" linkHref="/dealer-portal/active" link="View active leads →">
        <ActiveLeadPipeline leads={active} />
      </Panel>
    </section>
    <section className={styles.lowerGrid}>
      <Panel title="Recent activity" link="Latest lead activity">
        {recentNotes.length ? <div className={styles.compactRows}><div className={`${styles.compactRow} ${styles.compactHead}`}><span>Date</span><span>Motorcycle</span><span>Status</span></div>{recentNotes.map(({ note, lead }) => <Link href={leadHref(lead, "active", "customer")} className={`${styles.compactRow} ${styles.clickableRow}`} key={note.id}><span>{formatActivityTime(note.created_at)}</span><strong>{leadTitle(lead)}</strong><span className={styles.pill}>{formatActivityStatus(note)}</span></Link>)}</div> : <EmptyInline copy="No recent activity yet." />}
      </Panel>
      <Panel title="Notifications" link="Recorded in notification ledger">
        <EmptyInline copy="Dealer notification delivery is recorded by the live notification ledger when lifecycle events occur." />
      </Panel>
    </section>
    <aside className={styles.tip}><LightbulbIcon /><p><strong>Tip:</strong> Keep your dealership profile current to help MotorGeeks match you with relevant opportunities.</p><Link href="/dealer-portal/settings">Update my profile →</Link></aside>
  </section>;
}

function ActiveLeadPipeline({ leads }: { leads: DealerVisibleLead[] }) {
  return <div className={styles.pipelineRows}>{workStatuses.map(([status, label]) => {
    const count = leads.filter(lead => lead.portal_claim_status === status).length;
    return <div key={status}><span>{label}</span><strong>{count}</strong></div>;
  })}</div>;
}

function OpportunityList({ leads, title, subtitle, empty }: { leads: DealerVisibleLead[]; title: string; subtitle: string; empty: string }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [check, setCheck] = useState("all");
  const visible = useMemo(() => filterAndSortLeads(leads, search, sort, check), [leads, search, sort, check]);
  return <section className={styles.dashboard}>
    <div className={styles.dashboardHeader}><div><h1>{title}</h1><p>{subtitle}</p></div><span className={styles.dashboardDate}>{visible.length} opportunities</span></div>
    <div className={styles.toolbar}>
      <label className={styles.searchBox}>Search<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search make, model or registration" /></label>
      <label className={styles.selectBox}>Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="distance">Nearest first</option><option value="asking">Asking price</option></select></label>
      <label className={styles.selectBox}>Vehicle check<select value={check} onChange={event => setCheck(event.target.value)}><option value="all">All checks</option><option value="clear">Clear only</option><option value="review">With advisories</option></select></label>
    </div>
    <Panel title={title} link="Updated from live portal">
      {visible.length ? <OpportunityRows leads={visible} /> : <EmptyInline copy={empty} />}
    </Panel>
  </section>;
}

function LeadList({ leads, section, title, subtitle }: { leads: DealerVisibleLead[]; section: "active" | "purchased" | "lost"; title: string; subtitle: string }) {
  return <section className={styles.dashboard}>
    <div className={styles.dashboardHeader}><div><h1>{title}</h1><p>{subtitle}</p></div><span className={styles.dashboardDate}>{leads.length} records</span></div>
    <Panel title={title} link="Live portal records">
      {leads.length ? <OpportunityRows leads={leads} section={section} /> : <EmptyInline copy={`No ${title.toLowerCase()} records right now.`} />}
    </Panel>
  </section>;
}

function OpportunityRows({ leads, compact = false, section = "opportunities" }: { leads: DealerVisibleLead[]; compact?: boolean; section?: string }) {
  const rows = leads.map(lead => leadRow(lead));
  return <div className={`${styles.opTable} ${compact ? "" : styles.opportunityTable}`}>
    <div className={compact ? `${styles.tableHead} ${styles.dashboardOpportunityHead}` : `${styles.tableHead} ${styles.opportunityHead}`}>
      {compact ? <><span>Motorcycle</span><span>Mileage / Location</span><span>Seller asking</span><span>Vehicle check</span><span>Status</span></> : <><span>Motorcycle</span><span>Reg</span><span>Mileage</span><span>Location</span><span>Seller asking</span><span>Vehicle check</span><span>Status</span><span>Action</span></>}
    </div>
    {rows.map(row => compact
      ? <Link className={`${styles.tableRow} ${styles.dashboardOpportunityRow} ${styles.clickableRow}`} href={leadHref(row.lead, section)} key={row.lead.id}><span className={styles.bikeCell}>{row.image}<span><strong>{row.title}</strong><small>{row.lead.reg || "Registration pending"} · {formatLeadDate(row.lead.created_at || row.lead.date)}</small></span></span><span><strong>{row.mileage}</strong><small>{[row.location, row.distance].filter(Boolean).join(" · ")}</small></span><span className={styles.price}>{row.asking}</span><span className={`${styles.checkChip} ${row.checkNeedsReview ? styles.warning : ""}`}>{row.check}</span><span className={`${styles.status} ${row.status !== "New" ? styles.viewed : ""}`}>{row.status}</span></Link>
      : <Link className={`${styles.tableRow} ${styles.opportunityRow} ${styles.clickableRow}`} href={leadHref(row.lead, section)} key={row.lead.id}><span className={styles.bikeCell}>{row.image}<span><strong>{row.title}</strong><small>{row.subtitle}</small></span></span><span>{row.lead.reg || "-"}</span><span>{row.mileage}</span><span><strong>{row.location}</strong><small>{row.distance}</small></span><span className={styles.price}>{row.asking}</span><span className={`${styles.checkChip} ${row.checkNeedsReview ? styles.warning : ""}`}>{row.check}</span><span className={`${styles.status} ${row.status !== "New" ? styles.viewed : ""}`}>{row.status}</span><span className={styles.rowAction}>View opportunity →</span></Link>)}
  </div>;
}

function LeadWorkspaceView({ dealer, lead, activeTab, tabsRef, busy, error, notice, onClaim, onSelectTab, onChanged }: { dealer: DealerPortalAccountWithPreferences; lead: DealerVisibleLead; activeTab: LeadTab; tabsRef: React.RefObject<HTMLElement | null>; busy: boolean; error: string; notice: string; onClaim: () => void; onSelectTab: (tab: LeadTab) => void; onChanged: () => Promise<void> }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const images = lead.resolved_images ?? combineLeadImages(lead);
  const title = leadTitle(lead);
  const unlocked = Boolean(lead.customer_unlocked);
  const tabs: [LeadTab, string][] = [["overview", "Overview"], ["vehicle-check", "Vehicle Check"], ["mot", "MOT & Mileage"], ["location", "Location"], ...(unlocked ? [["customer", "Customer / Work Lead"] as [LeadTab, string]] : [])];
  const tab = activeTab === "customer" && !unlocked ? "overview" : activeTab;
  const latestNote = lead.portal_notes?.[0] ?? null;
  const latestOffer = lead.portal_notes?.find(note => note.note_type === "offer") ?? null;

  const showPrevious = useCallback(() => setImageIndex(current => images.length ? (current + images.length - 1) % images.length : 0), [images.length]);
  const showNext = useCallback(() => setImageIndex(current => images.length ? (current + 1) % images.length : 0), [images.length]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, showPrevious, showNext]);

  return <section className={styles.dashboard}>
    <Link className={styles.breadcrumb} href="/dealer-portal/opportunities">← Opportunities</Link>
    {error && <p className={styles.errorMessage}>{error}</p>}{notice && <p className={styles.successMessage}>{notice}</p>}
    <section className={styles.leadHeader}>
      <div><span className={styles.status}>{displayLeadStatus(lead)}</span><h1>{title}</h1><p>{[lead.reg, formatMileage(lead.mileage), displayEngine(lead.engine), lead.colour].filter(Boolean).join(" · ")}</p></div>
      <aside className={styles.claimBox}><span>Seller asking</span><strong>{moneyOrText(lead.price)}</strong>{!unlocked ? <button className={styles.blueButton} type="button" disabled={busy} onClick={onClaim}>{busy ? "Claiming..." : "Claim opportunity"}</button> : <b>{statusLabel(lead.portal_claim_status || "claimed")}</b>}</aside>
    </section>
    <section className={styles.summaryCells}>{workspaceFacts(lead, unlocked, latestNote, latestOffer).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    <section className={styles.workspaceGrid}>
      <article className={styles.galleryPanel}><WorkspaceGallery images={images} imageIndex={imageIndex} title={title} onPrevious={showPrevious} onNext={showNext} onOpen={(index) => { setImageIndex(index); setLightboxOpen(true); }} /></article>
      <article className={styles.customerLocked}>{unlocked ? <><CheckIcon /><h2>Customer details unlocked</h2><p>{customerName(lead)} · {lead.portal_location_label || "Location pending"}</p></> : <><LockIcon /><h2>Customer details</h2><p>Customer contact details will be available after you claim this opportunity.</p></>}</article>
    </section>
    <nav className={styles.leadTabs} aria-label="Lead workspace tabs" ref={tabsRef}>{tabs.map(([value, label]) => <button className={tab === value ? styles.active : ""} type="button" onClick={() => onSelectTab(value)} key={value}>{label}</button>)}</nav>
    <div className={styles.tabContent}>
      {tab === "overview" && <OverviewTab lead={lead} />}
      {tab === "vehicle-check" && <VehicleCheckTab lead={lead} />}
      {tab === "mot" && <MotTab lead={lead} />}
      {tab === "location" && <LocationTab dealer={dealer} lead={lead} unlocked={unlocked} />}
      {tab === "customer" && <CustomerWorkTab lead={lead} onChanged={onChanged} />}
    </div>
    {lightboxOpen && <PhotoLightbox images={images} title={title} index={imageIndex} setIndex={setImageIndex} onClose={() => setLightboxOpen(false)} />}
  </section>;
}

function WorkspaceGallery({ images, imageIndex, title, onPrevious, onNext, onOpen }: { images: string[]; imageIndex: number; title: string; onPrevious: () => void; onNext: () => void; onOpen: (index: number) => void }) {
  const image = images[imageIndex];
  if (!image) return <div className={styles.mainPhoto}><div className={styles.noPhotoText}><CameraIcon /><strong>No photos supplied</strong></div><span>0 photos</span></div>;
  const hasMultiple = images.length > 1;
  return <div className={styles.mainPhoto}>
      <button className={styles.photoNavPrevious} type="button" onClick={onPrevious} aria-label="Previous photo" disabled={!hasMultiple}><ChevronIcon direction="left" /></button>
      <button className={styles.mainImageButton} type="button" onClick={() => onOpen(imageIndex)} aria-label="Open photo gallery"><img src={image} alt={`${title} preview`} /></button>
      <button className={styles.photoNavNext} type="button" onClick={onNext} aria-label="Next photo" disabled={!hasMultiple}><ChevronIcon direction="right" /></button>
      <span>{imageIndex + 1} of {images.length} photo{images.length === 1 ? "" : "s"}</span>
    </div>;
}

function OverviewTab({ lead }: { lead: DealerVisibleLead }) {
  const sellerComments = lead.customer_message || lead.extras;
  const rows = [["Registration", lead.reg], ["Make", lead.make], ["Model", lead.model], ["Year", lead.year], ["Engine", displayEngine(lead.engine)], ["Colour", lead.colour], ["Mileage", formatMileage(lead.mileage)], ["Owners", displayText(lead.owners)], ["Keys", displayText(lead.spare_keys)], ["Service history", displayText(lead.service || lead.history)], ["MOT", formatReadableDate(lead.mot) || displayText(lead.mot)], ["Condition", displayText(lead.bike_condition || lead.damage)]];
  return <section className={styles.overviewGrid}>
    <Panel title="Bike details" link="Vehicle record"><div className={styles.factTable}>{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || "Not supplied"}</strong></div>)}</div>{sellerComments && <div className={styles.sellerComments}><span>Seller comments</span><p>{sellerComments}</p></div>}</Panel>
    <Panel title="Condition & history" link="Seller supplied"><div className={styles.conditionList}>{conditionRows(lead).map(([label, value]) => <p key={label}><strong>{label}</strong>{value || "Not supplied"}</p>)}</div></Panel>
  </section>;
}

function VehicleCheckTab({ lead }: { lead: DealerVisibleLead }) {
  const check = lead.portal_vehicle_check;
  if (!check) return <section className={styles.singlePanelGrid}><Panel title="Vehicle Check" link="Not available"><p>Vehicle check not yet available. MotorGeeks will show the HPI-style summary once it has been stored.</p></Panel></section>;
  const reportHref = check.report_url ? `/api/autotrader/vehicle-check-report?url=${encodeURIComponent(check.report_url)}` : "";
  return <section className={styles.singlePanelGrid}><Panel title="Vehicle Check" link={check.status}><div className={styles.checkHeader}><strong>{check.clear === false ? "Needs review" : check.clear === true ? "Clear" : check.status}</strong>{reportHref && <a className={styles.rowAction} href={reportHref} target="_blank" rel="noreferrer">View report →</a>}</div><div className={styles.checkGrid}>{check.flags.map(flag => <article className={`${styles.checkResult} ${flag.state === "warning" ? styles.warning : flag.state === "clear" ? styles.clear : ""}`} key={flag.key}><b>{flag.state === "warning" ? "!" : flag.state === "clear" ? "OK" : "?"}</b><div><strong>{flag.label}</strong><span>{flag.detail}</span></div></article>)}</div>{check.details.length > 0 && <div className={styles.factTable}>{check.details.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>}</Panel></section>;
}

function MotTab({ lead }: { lead: DealerVisibleLead }) {
  const check = lead.portal_vehicle_check;
  if (!check) return <section className={styles.singlePanelGrid}><Panel title="MOT & Mileage" link="Not available"><p>MOT and mileage history will show here once available.</p></Panel></section>;
  return <section className={styles.motLayout}>
    <Panel title={`MOT History${lead.reg ? ` - ${lead.reg}` : ""}`} link={check.mot_expiry ? `Valid until ${formatMotDate(check.mot_expiry)}` : "Stored history"}>{(check.mileage_history?.length ?? 0) > 0 && <MileageGraph history={check.mileage_history ?? []} />}<div className={styles.motTests}>{(check.mot_history ?? []).length ? (check.mot_history ?? []).map((item, index) => <MotRow item={item} expanded={index === 0} key={`${item.date}-${index}`} />) : <p>Historic MOT records are not available from the stored vehicle check yet.</p>}</div></Panel>
  </section>;
}

function LocationTab({ dealer, lead, unlocked }: { dealer: DealerPortalAccount; lead: DealerVisibleLead; unlocked: boolean }) {
  const publicLocation = { location_town: lead.location_town || lead.portal_location_label, location_display_name: unlocked ? lead.location_display_name : null, postcode: unlocked ? lead.postcode : null, normalised_postcode: unlocked ? lead.normalised_postcode : null, latitude: unlocked ? lead.latitude : null, longitude: unlocked ? lead.longitude : null };
  const mapUrl = staticMapUrl(publicLocation);
  const forceFallback = process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("map") === "fallback";
  const [failedMapUrl, setFailedMapUrl] = useState<string | null>(null);
  const showFallback = forceFallback || !mapUrl || failedMapUrl === mapUrl;
  const hasLocation = Boolean(publicLocation.location_town || publicLocation.location_display_name || publicLocation.postcode || publicLocation.latitude != null);
  return <section className={styles.locationLayout}>
    <article className={styles.mapPreview}>{mapUrl && !showFallback ? <iframe title="Approximate motorcycle location map" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" onError={() => setFailedMapUrl(mapUrl)} /> : <div><LocationIcon /><strong>Map unavailable</strong><span>Approximate location shown using the information provided.</span></div>}</article>
    <article className={styles.panel}><header className={styles.panelHeader}><h2>Location</h2><span>{unlocked ? "Customer location" : "Approximate"}</span></header><div className={styles.factTable}><div><span>Motorcycle</span><strong>{lead.portal_location_label || "Location pending"}</strong></div><div><span>Your dealership</span><strong>{dealer.postcode || "Dealer postcode not set"}</strong></div><div><span>Distance</span><strong>{lead.portal_distance_label || "Distance not calculated"}</strong></div></div>{hasLocation && <div className={styles.panelActions}><a className={styles.outlineMini} href={googleMapsUrl(publicLocation)} target="_blank" rel="noreferrer">View Map</a><a className={styles.outlineMini} href={directionsUrl(dealer.postcode || dealer.trading_name, publicLocation)} target="_blank" rel="noreferrer">Directions</a></div>}</article>
  </section>;
}

function CustomerWorkTab({ lead, onChanged }: { lead: DealerVisibleLead; onChanged: () => Promise<void> }) {
  const claimId = lead.portal_claim_id ?? "";
  const active = claimId && !terminalStatuses.has(String(lead.portal_claim_status));
  const purchasedLater = claimId && lead.portal_claim_status === "lost";
  return <section className={styles.crmLayout}>
    <Panel title="Customer details" link="Claimed lead"><div className={styles.contactCard}><h3>{customerName(lead)}</h3><p>{lead.portal_location_label || lead.postcode || "Location pending"}</p><div>{lead.phone && <a href={`tel:${lead.phone}`}>Call {lead.phone}</a>}{lead.email && <a href={`mailto:${lead.email}`}>Email customer</a>}</div></div></Panel>
    {active && <WorkLeadPanel claimId={claimId} lead={lead} onChanged={onChanged} />}
    {purchasedLater && <PurchasedLaterPanel claimId={claimId} lead={lead} onChanged={onChanged} />}
    <Panel title="Activity timeline" link="Chronological"><div className={styles.timeline}>{lead.portal_notes?.length ? lead.portal_notes.map((note, index) => <p key={note.id}><span>{index + 1}</span>{statusLabel(note.note_type)} · {formatLeadDate(note.created_at)} — {note.body}</p>) : <p>No activity recorded yet.</p>}</div></Panel>
  </section>;
}

function WorkLeadPanel({ claimId, lead, onChanged }: { claimId: string; lead: DealerVisibleLead; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [noteBody, setNoteBody] = useState("");
  const [lostReason, setLostReason] = useState<string>(lostReasons[0]);
  const [lostReasonDetail, setLostReasonDetail] = useState("");
  const [purchase, setPurchase] = useState({ purchase_price: String(safeNumber(lead.price) ?? ""), purchase_date: new Date().toISOString().slice(0, 10), collection_date: "", mileage_at_purchase: String(safeNumber(lead.mileage) ?? ""), notes: "" });

  async function updateStatus(status: DealerLeadClaimStatus, extra: Record<string, unknown> = {}) {
    setBusy(status);
    setMessage("");
    const response = await fetch(`/api/dealer-portal/claims/${claimId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, ...extra }) });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to update status.");
    else { setMessage("Status updated."); await onChanged(); }
    setBusy("");
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("note");
    const response = await fetch(`/api/dealer-portal/claims/${claimId}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note_type: noteType, body: noteBody }) });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to add note.");
    else { setNoteBody(""); setMessage("Note added."); await onChanged(); }
    setBusy("");
  }

  async function reportPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("purchase");
    const response = await fetch(`/api/dealer-portal/claims/${claimId}/purchase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(purchase) });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to report purchase.");
    else { setMessage("Purchase reported and Successful Purchase Fee created."); await onChanged(); }
    setBusy("");
  }

  return <Panel title="Work lead" link="Current state">
    {message && <p className={message.includes("Unable") ? styles.errorMessage : styles.successMessage}>{message}</p>}
    <div className={styles.workflowChips}>{workStatuses.map(([status, label]) => <button className={lead.portal_claim_status === status ? styles.active : ""} type="button" disabled={Boolean(busy)} onClick={() => void updateStatus(status)} key={status}>{label}</button>)}</div>
    <form className={styles.mockForm} onSubmit={addNote}><select value={noteType} onChange={event => setNoteType(event.target.value)}><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="offer">Offer</option></select><textarea value={noteBody} onChange={event => setNoteBody(event.target.value)} placeholder="Add activity note, offer, call outcome or next step" required /><button className={styles.blueButton} disabled={Boolean(busy)}>{busy === "note" ? "Adding..." : "Add Note"}</button></form>
    <details className={styles.outcomePanel}><summary>Lost / Return</summary><div><select value={lostReason} onChange={event => setLostReason(event.target.value)}>{lostReasons.map(reason => <option key={reason}>{reason}</option>)}</select>{lostReason === "Other" && <input value={lostReasonDetail} onChange={event => setLostReasonDetail(event.target.value)} placeholder="Brief reason" />}<button type="button" onClick={() => void updateStatus("lost", { lost_reason: lostReason, lost_reason_detail: lostReasonDetail })}>Mark Lost</button><button type="button" onClick={() => void updateStatus("returned_to_pool")}>Return to Pool</button></div></details>
    <details className={styles.outcomePanel}><summary>Report Purchase</summary><form onSubmit={reportPurchase}><Input label="Purchase price" value={purchase.purchase_price} set={value => setPurchase(current => ({ ...current, purchase_price: value }))} type="number" required /><Input label="Purchase date" value={purchase.purchase_date} set={value => setPurchase(current => ({ ...current, purchase_date: value }))} type="date" required /><Input label="Collection date" value={purchase.collection_date} set={value => setPurchase(current => ({ ...current, collection_date: value }))} type="date" /><Input label="Mileage" value={purchase.mileage_at_purchase} set={value => setPurchase(current => ({ ...current, mileage_at_purchase: value }))} type="number" /><label className={styles.fullField}><span>Notes</span><textarea value={purchase.notes} onChange={event => setPurchase(current => ({ ...current, notes: event.target.value }))} /></label><button className={styles.blueButton} disabled={Boolean(busy)}>{busy === "purchase" ? "Reporting..." : "Mark as Purchased"}</button></form></details>
  </Panel>;
}

function PurchasedLaterPanel({ claimId, lead, onChanged }: { claimId: string; lead: DealerVisibleLead; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [purchase, setPurchase] = useState({ purchase_price: String(safeNumber(lead.price) ?? ""), purchase_date: new Date().toISOString().slice(0, 10), collection_date: "", mileage_at_purchase: String(safeNumber(lead.mileage) ?? ""), notes: "" });
  async function reportPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch(`/api/dealer-portal/claims/${claimId}/purchase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(purchase) });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to report later purchase.");
    else { setMessage("Purchased Later reported and Successful Purchase Fee created."); await onChanged(); }
    setBusy(false);
  }
  return <Panel title="Customer Came Back - Purchased" link="Attribution workflow">{message && <p className={message.includes("Unable") ? styles.errorMessage : styles.successMessage}>{message}</p>}<form className={styles.mockForm} onSubmit={reportPurchase}><Input label="Purchase price" value={purchase.purchase_price} set={value => setPurchase(current => ({ ...current, purchase_price: value }))} type="number" required /><Input label="Purchase date" value={purchase.purchase_date} set={value => setPurchase(current => ({ ...current, purchase_date: value }))} type="date" required /><Input label="Collection date" value={purchase.collection_date} set={value => setPurchase(current => ({ ...current, collection_date: value }))} type="date" required /><Input label="Mileage" value={purchase.mileage_at_purchase} set={value => setPurchase(current => ({ ...current, mileage_at_purchase: value }))} type="number" required /><label className={styles.fullField}><span>Notes</span><textarea value={purchase.notes} onChange={event => setPurchase(current => ({ ...current, notes: event.target.value }))} required /></label><button className={styles.blueButton} disabled={busy}>{busy ? "Reporting..." : "Report Purchased Later"}</button></form></Panel>;
}

function PaymentsPanel() {
  const [payload, setPayload] = useState<DealerPaymentsPayload>({ fees: [], ledger: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    async function loadPayments() {
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
  const totals = payload.fees.reduce((sum, fee) => ({ fees: sum.fees + Number(fee.fee_amount ?? 0), credits: sum.credits + Number(fee.credit_amount ?? 0), adjustments: sum.adjustments + Number(fee.adjustment_amount ?? 0), invoiced: sum.invoiced + Number(fee.invoiced_amount ?? 0), paid: sum.paid + Number(fee.paid_amount ?? 0), outstanding: sum.outstanding + Number(fee.outstanding_amount ?? 0) }), { fees: 0, credits: 0, adjustments: 0, invoiced: 0, paid: 0, outstanding: 0 });
  return <section className={styles.dashboard}><div className={styles.dashboardHeader}><div><h1>Payments</h1><p>Read-only account view for Successful Purchase Fees, credits and payments.</p></div><span className={styles.dashboardDate}>Live account ledger</span></div>{message && <p className={styles.errorMessage}>{message}</p>}<section className={styles.metrics}><Metric icon={<TagIcon />} value={formatGbp(totals.outstanding)} label="Outstanding" detail="awaiting settlement" /><Metric icon={<DocIcon />} value={formatGbp(totals.invoiced)} label="Invoiced" detail="issued manually" /><Metric icon={<CheckIcon />} value={formatGbp(totals.paid)} label="Paid" detail="recorded payments" /><Metric icon={<ReturnIcon />} value={formatGbp(totals.credits)} label="Credits" detail="available balance" /></section><Panel title="Transactions" link="Read-only ledger">{loading ? <EmptyInline copy="Loading account history..." /> : payload.fees.length ? <SimpleTable headers={["Date", "Motorcycle / reference", "Fee", "Invoiced", "Paid", "Outstanding", "Status"]} rows={payload.fees.map(fee => [formatLeadDate(fee.created_at), paymentLeadTitle(fee.lead), formatGbp(fee.fee_amount), formatGbp(fee.invoiced_amount), formatGbp(fee.paid_amount), formatGbp(fee.outstanding_amount), statusLabel(fee.status)])} /> : <EmptyInline copy="No Successful Purchase Fees yet." />}</Panel><section className={styles.lowerGrid}><Panel title="Account activity" link="Recent ledger entries">{payload.ledger.length ? <SimpleTable compact headers={["Date", "Type", "Reference", "Amount"]} rows={payload.ledger.map(entry => [formatLeadDate(entry.created_at), statusLabel(entry.entry_type), entry.note || `Lead #${entry.website_lead_id ?? "-"}`, formatGbp(entry.amount)])} /> : <EmptyInline copy="No ledger entries yet." />}</Panel><Panel title="Account summary" link="Manual invoicing"><div className={styles.summaryList}><p><strong>Fee total:</strong> {formatGbp(totals.fees)}</p><p><strong>Adjustments:</strong> {formatGbp(totals.adjustments)}</p><p><strong>Billing method:</strong> Manual invoice</p></div></Panel></section></section>;
}

function DealershipPanel({ dealer }: { dealer: DealerPortalAccountWithPreferences }) {
  return <section className={styles.dashboard}><div className={styles.dashboardHeader}><div><h1>My Dealership</h1><p>Company profile and account information held by MotorGeeks.</p></div><Link className={styles.blueButton} href="/dealer-portal/settings">Edit permitted details</Link></div><section className={styles.profileGrid}><Panel title="Dealership profile" link="Verified account"><div className={styles.factTable}>{dealerDetails(dealer).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || "Not supplied"}</strong></div>)}</div></Panel><Panel title="Account status" link="Summary"><div className={styles.statusStack}><div><CheckIcon /><strong>{statusLabel(dealer.account_status)}</strong><p>Portal account state.</p></div><div><TagIcon /><strong>Successful Purchase Fee</strong><p>{formatGbp(dealer.successful_purchase_fee)} per completed purchase.</p></div><div><ClockIcon /><strong>Attribution</strong><p>{dealer.attribution_period_days} days.</p></div></div></Panel></section></section>;
}

function SettingsPanel({ dealer, role, onSaved }: { dealer: DealerPortalAccountWithPreferences; role: DealerPortalUserRole; onSaved: (dealer: DealerPortalAccountWithPreferences) => void }) {
  const canManage = role === "dealer_admin";
  const [form, setForm] = useState({ trading_address: dealer.trading_address ?? "", main_contact: dealer.main_contact ?? "", telephone: dealer.telephone ?? "", mobile_whatsapp: dealer.mobile_whatsapp ?? "", main_email: dealer.main_email ?? "", accounts_email: dealer.accounts_email ?? "", website: dealer.website ?? "", postcode: dealer.postcode ?? "" });
  const [buying, setBuying] = useState(() => buyingDefaults(dealer));
  const [geography, setGeography] = useState(() => geographyDefaults(dealer));
  const [users, setUsers] = useState<DealerPortalUserSummary[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<DealerPortalUserRole>("dealer_user");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { if (canManage) void loadUsers(); }, [canManage]);
  async function loadUsers() {
    const response = await fetch("/api/dealer-portal/users", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setUsers(payload.users ?? []);
    else setMessage(payload.error || "Unable to load dealership users.");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return setMessage("Dealer Admin access is required to update account settings.");
    setSaving(true);
    const response = await fetch("/api/dealer-portal/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, buying_preferences: buying, geography_preferences: geography }) });
    const payload = await response.json();
    if (response.ok) { onSaved(payload.dealer); setMessage("Account preferences saved."); }
    else setMessage(payload.error || "Unable to save account preferences.");
    setSaving(false);
  }
  async function inviteUser() {
    if (!canManage) return;
    setSaving(true);
    const response = await fetch("/api/dealer-portal/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: userEmail, role: userRole }) });
    const payload = await response.json();
    if (response.ok) { setUserEmail(""); setMessage(payload.invited ? "Dealer user invited." : "Dealer user linked."); await loadUsers(); }
    else setMessage(payload.error || "Unable to invite dealership user.");
    setSaving(false);
  }
  async function updateUser(id: string, updates: Partial<Pick<DealerPortalUserSummary, "role" | "active">>) {
    if (!canManage) return;
    setSaving(true);
    const response = await fetch(`/api/dealer-portal/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    const payload = await response.json();
    if (response.ok) { setMessage("Dealer user updated."); await loadUsers(); }
    else setMessage(payload.error || "Unable to update dealership user.");
    setSaving(false);
  }
  return <form className={styles.dashboard} onSubmit={save}><div className={styles.dashboardHeader}><div><h1>Account Settings</h1><p>{canManage ? "Buying preferences, geography and dealership user permissions." : "Your account and buying profile are read-only. Ask your Dealer Admin to update dealership settings."}</p></div>{canManage && <button className={styles.blueButton} disabled={saving}>{saving ? "Saving..." : "Save settings"}</button>}</div>{message && <p className={message.includes("Unable") || message.includes("required") ? styles.errorMessage : styles.successMessage}>{message}</p>}<section className={styles.settingsGrid}><Panel title="Company details" link={canManage ? "Dealer Admin editable" : "Read only"}><div className={styles.preferenceGrid}>{Object.entries(form).map(([key, value]) => <Input key={key} label={settingLabel(key)} value={value} set={next => setForm(current => ({ ...current, [key]: next }))} disabled={!canManage} />)}</div></Panel><Panel title="Buying preferences" link={canManage ? "Dealer Admin editable" : "Read only"}><div className={styles.preferenceGrid}><TextListInput label="Types" value={buying.motorcycle_types} set={value => setBuying(current => ({ ...current, motorcycle_types: value }))} disabled={!canManage} /><TextListInput label="Makes wanted" value={buying.makes_wanted} set={value => setBuying(current => ({ ...current, makes_wanted: value }))} disabled={!canManage} /><TextListInput label="Makes excluded" value={buying.makes_excluded} set={value => setBuying(current => ({ ...current, makes_excluded: value }))} disabled={!canManage} /><TextListInput label="Models wanted" value={buying.models_wanted} set={value => setBuying(current => ({ ...current, models_wanted: value }))} disabled={!canManage} /><NumberInput label="Minimum year" value={buying.minimum_year} set={value => setBuying(current => ({ ...current, minimum_year: value }))} disabled={!canManage} /><NumberInput label="Maximum age" value={buying.maximum_age_years} set={value => setBuying(current => ({ ...current, maximum_age_years: value }))} disabled={!canManage} /><NumberInput label="Maximum mileage" value={buying.maximum_mileage} set={value => setBuying(current => ({ ...current, maximum_mileage: value }))} disabled={!canManage} /><NumberInput label="Buying radius" value={geography.maximum_radius_miles} set={value => setGeography(current => ({ ...current, maximum_radius_miles: value }))} disabled={!canManage} /></div></Panel><Panel title="History and geography rules" link="Matching criteria"><div className={styles.checklistGrid}>{(["accepts_non_running", "accepts_insurance_category", "accepts_outstanding_finance", "accepts_imported", "accepts_modified"] as const).map(key => <Checkbox key={key} label={settingLabel(key)} checked={buying[key]} set={value => setBuying(current => ({ ...current, [key]: value }))} disabled={!canManage} />)}{(["england", "wales", "scotland", "northern_ireland", "republic_of_ireland"] as const).map(key => <Checkbox key={key} label={settingLabel(key)} checked={geography[key]} set={value => setGeography(current => ({ ...current, [key]: value }))} disabled={!canManage} />)}</div></Panel>{canManage && <Panel title="Dealer users" link="Role controlled"><div className={styles.userInvite}><Input label="Email" value={userEmail} set={setUserEmail} type="email" /><label><span>Role</span><select value={userRole} onChange={event => setUserRole(event.target.value === "dealer_admin" ? "dealer_admin" : "dealer_user")}><option value="dealer_user">Dealer User</option><option value="dealer_admin">Dealer Admin</option></select></label><button className={styles.blueButton} type="button" disabled={saving || !userEmail.trim()} onClick={() => void inviteUser()}>Invite user</button></div><SimpleTable compact headers={["Email", "Role", "Status", "Action"]} rows={users.map(user => [user.email || "Email unavailable", user.role === "dealer_admin" ? "Dealer Admin" : "Dealer User", user.active ? "Active" : "Inactive", user.active ? "Can deactivate below" : "Inactive"])} />{users.map(user => <button className={styles.outlineMini} type="button" disabled={saving || !user.active} onClick={() => void updateUser(user.id, { active: false })} key={user.id}>Deactivate {user.email}</button>)}</Panel>}</section></form>;
}

function SupportPanel() {
  return <section className={styles.dashboard}><div className={styles.dashboardHeader}><div><h1>Help & Support</h1><p>Support for using MotorGeeks opportunities and account tools.</p></div><Link className={styles.blueButton} href="/">Back to MotorGeeks</Link></div><section className={styles.supportGrid}>{["Claiming opportunities", "Working active leads", "Reporting a purchase", "Successful Purchase Fees", "Managing dealership users", "Buying preferences"].map(topic => <article className={styles.supportCard} key={topic}><HelpIcon /><h2>{topic}</h2><p>Contact MotorGeeks support for help with this area.</p></article>)}</section><article className={`${styles.panel} ${styles.supportContact}`}><h2>Contact MotorGeeks support</h2><p>Email support@motorgeeks.co.uk for help with your dealer account, opportunities or billing questions.</p></article></section>;
}

function DealerV4Shell({ dealer, section, counts, onSignOut, children }: { dealer: DealerPortalAccountWithPreferences; section: PortalSection; counts: { available: number; active: number; purchased: number; lost: number }; onSignOut?: () => void; children: React.ReactNode }) {
  return <main className={styles.app}>
    <aside className={styles.sidebar}><MotorGeeksLogo /><nav aria-label="Dealer Portal"><NavItem active={section === "dashboard"} href="/dealer-portal" icon={<HomeIcon />} label="Dashboard" /><NavItem active={section === "opportunities"} href="/dealer-portal/opportunities" icon={<DocIcon />} label="Opportunities" badge={String(counts.available)} /><NavItem active={section === "active"} href="/dealer-portal/active" icon={<ClockIcon />} label="Active Leads" badge={String(counts.active)} /><NavItem active={section === "purchased"} href="/dealer-portal/purchased" icon={<CheckIcon />} label="Purchased" badge={String(counts.purchased)} /><NavItem active={section === "lost"} href="/dealer-portal/lost" icon={<ReturnIcon />} label="Lost / Returned" badge={String(counts.lost)} /><NavItem active={section === "payments"} href="/dealer-portal/payments" icon={<TagIcon />} label="Payments" /><NavItem active={section === "dealership"} href="/dealer-portal/dealership" icon={<BuildingIcon />} label="My Dealership" /><NavItem active={section === "settings"} href="/dealer-portal/settings" icon={<GearIcon />} label="Account Settings" /><NavItem active={section === "support"} href="/dealer-portal/support" icon={<HelpIcon />} label="Help & Support" /></nav><Link className={styles.sidebarBack} href="/">← Back to website</Link></aside>
    <section className={styles.workspace}><header className={styles.topbar} data-dealer-topbar="true"><div className={styles.topbarBrand}><MotorGeeksLogo /><small>Dealer Portal</small></div><div className={styles.topActions}><span>Help</span><span className={styles.profile}>{dealerInitials(dealer.trading_name)}</span><span>{dealer.trading_name}</span>{onSignOut && <button type="button" onClick={onSignOut}>Sign out</button>}</div></header>{children}</section>
  </main>;
}

function Panel({ title, link, linkHref, children }: { title: string; link: string; linkHref?: string; children: React.ReactNode }) {
  return <article className={styles.panel}><header className={styles.panelHeader}><h2>{title}</h2>{linkHref ? <Link href={linkHref}>{link}</Link> : <span>{link}</span>}</header>{children}</article>;
}

function SimpleTable({ headers, rows, compact = false }: { headers: string[]; rows: string[][]; compact?: boolean }) {
  return <div className={`${styles.simpleTable} ${compact ? styles.compactTable : ""}`} style={{ "--cols": `${headers.length}` } as React.CSSProperties}><div className={styles.simpleHead}>{headers.map(header => <span key={header}>{header}</span>)}</div>{rows.map((row, index) => <div className={styles.simpleRow} key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <span className={cellIndex === 0 ? styles.primaryCell : ""} key={`${cell}-${cellIndex}`}>{cell}</span>)}</div>)}</div>;
}

function PhotoLightbox({ images, title, index, setIndex, onClose }: { images: string[]; title: string; index: number; setIndex: React.Dispatch<React.SetStateAction<number>>; onClose: () => void }) {
  const previous = () => setIndex(current => (current + images.length - 1) % images.length);
  const next = () => setIndex(current => (current + 1) % images.length);
  if (typeof document === "undefined") return null;
  const hasMultiple = images.length > 1;
  return createPortal(<div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={`${title} photos`}><button className={styles.lightboxClose} type="button" onClick={onClose} aria-label="Close gallery"><CloseIcon /></button><button className={styles.lightboxNav} type="button" onClick={previous} aria-label="Previous photo" disabled={!hasMultiple}><ChevronIcon direction="left" /></button><figure><img src={images[index]} alt={`${title} large view`} /><figcaption>{title} · {index + 1} of {images.length}</figcaption></figure><button className={styles.lightboxNav} type="button" onClick={next} aria-label="Next photo" disabled={!hasMultiple}><ChevronIcon direction="right" /></button></div>, document.body);
}

function Metric({ icon, value, label, detail }: { icon: React.ReactNode; value: string; label: string; detail: string }) {
  return <article className={styles.metric}>{icon}<div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div></article>;
}

function NavItem({ icon, label, badge, active, href }: { icon: React.ReactNode; label: string; badge?: string; active: boolean; href: string }) {
  return <Link className={`${styles.navItem} ${active ? styles.active : ""}`} href={href}>{icon}<span>{label}</span>{badge && badge !== "0" && <b className={styles.navBadge}>{badge}</b>}</Link>;
}

function Benefit({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div className={styles.benefitItem}>{icon}<div><strong>{title}</strong><p>{children}</p></div></div>;
}

function EmptyPanel({ title, copy }: { title: string; copy: string }) {
  return <article className={styles.panel}><h2>{title}</h2><p>{copy}</p></article>;
}

function EmptyInline({ copy }: { copy: string }) {
  return <div className={styles.emptyState}>{copy}</div>;
}

function V4Loading({ label }: { label: string }) {
  return <main className={styles.loadingApp}><div className={styles.loadingState} role="status" aria-live="polite"><span />{label}</div></main>;
}

function DealerUnavailable({ error, status }: { error?: string; status?: PortalStatus | null }) {
  if (status?.accountStatus) {
    return <main className={styles.app}><section className={styles.workspace}><section className={styles.statusPage}>
      <MotorGeeksLogo variant="wordmarkDark" />
      <span className={styles.statusBadge}>{statusLabel(status.accountStatus)}</span>
      <h1>MotorGeeks account status</h1>
      <p>{dealerStatusMessage(status.accountStatus, status.dealer?.trading_name)}</p>
      <div className={styles.statusHelp}><h2>Help & Support</h2><p>Contact MotorGeeks support if you need help with your application or dealership access.</p><Link className={styles.blueButton} href="/dealer-portal/support">Help & Support</Link></div>
      <Link className={styles.outlineButton} href="/">Back to website</Link>
    </section></section></main>;
  }
  return <main className={styles.app}><section className={styles.workspace}><section className={styles.dashboard}><EmptyPanel title="Dealer access unavailable" copy={error || "Sign in with a linked dealer login, or ask MotorGeeks to set up your dealer account."} /><Link className={styles.blueButton} href="/dealer-login">Go to Dealer Login</Link></section></section></main>;
}

function Input({ label, value, set, type = "text", required = false, disabled = false }: { label: string; value: string; set: (value: string) => void; type?: string; required?: boolean; disabled?: boolean }) {
  return <label className={styles.field}><span>{label}</span><input type={type} value={value} required={required} disabled={disabled} min={type === "number" ? "0" : undefined} onChange={event => set(event.target.value)} /></label>;
}

function TextListInput({ label, value, set, disabled = false }: { label: string; value: string[]; set: (value: string[]) => void; disabled?: boolean }) {
  return <label className={styles.field}><span>{label}</span><input value={(value ?? []).join(", ")} disabled={disabled} onChange={event => set(Array.from(new Set(event.target.value.split(",").map(item => item.trim()).filter(Boolean))))} /></label>;
}

function NumberInput({ label, value, set, disabled = false }: { label: string; value: number | null; set: (value: number | null) => void; disabled?: boolean }) {
  return <label className={styles.field}><span>{label}</span><input type="number" min="0" value={value ?? ""} disabled={disabled} onChange={event => set(event.target.value === "" ? null : Number(event.target.value))} /></label>;
}

function Checkbox({ label, checked, set, disabled = false }: { label: string; checked: boolean; set: (value: boolean) => void; disabled?: boolean }) {
  return <label className={styles.checkItem}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => set(event.target.checked)} /><span>{label}</span></label>;
}

function MileageGraph({ history }: { history: DealerMileageHistoryItem[] }) {
  const ordered = [...history].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.mileage - a.mileage);
  const max = Math.max(...ordered.map(item => item.mileage), 1);
  return <div className={styles.mileageGraph}>{ordered.map(item => <div key={`${item.date}-${item.mileage}`}><span>{String(item.date).slice(0, 4) || item.source}</span><i><b style={{ width: `${Math.max(18, (item.mileage / max) * 100)}%` }} /></i><strong>{item.mileage.toLocaleString("en-GB")}</strong></div>)}</div>;
}

function MotRow({ item, expanded }: { item: DealerMotHistoryItem; expanded: boolean }) {
  const label = item.status === "pass" ? "PASS" : item.status === "fail" ? "FAIL" : "UNKNOWN";
  return <details className={`${styles.motTest} ${item.status === "fail" ? styles.warning : ""}`} open={expanded}><summary><span><b>{label}</b>{item.details.length > 0 && <em>{item.details.length} item{item.details.length === 1 ? "" : "s"}</em>}</span><small>{formatMotDate(item.date)}</small><small>{item.mileage == null ? "Mileage not supplied" : `${item.mileage.toLocaleString("en-GB")} MI`}</small></summary><div><dl><div><dt>Test date</dt><dd>{formatMotDate(item.date)}</dd></div><div><dt>Valid until</dt><dd>{formatMotDate(item.expiry)}</dd></div><div><dt>Mileage</dt><dd>{item.mileage == null ? "Not supplied" : `${item.mileage.toLocaleString("en-GB")} MI`}</dd></div></dl>{item.details.length > 0 ? <ul>{item.details.map(detail => <li key={detail}>{detail}</li>)}</ul> : <p>No advisories or failure items recorded for this test.</p>}</div></details>;
}

function leadRow(lead: DealerVisibleLead) {
  const images = lead.resolved_images ?? combineLeadImages(lead);
  const image = images[0];
  const check = lead.portal_vehicle_check;
  const checkNeedsReview = check?.clear === false || check?.flags.some(item => item.state === "warning");
  return { lead, title: leadTitle(lead), subtitle: lead.make ? `${lead.make} acquisition lead` : "Motorcycle acquisition lead", mileage: formatMileage(lead.mileage) || "Mileage pending", location: lead.portal_location_label || "Location pending", distance: lead.portal_distance_label?.replace(" from your dealership", "") || "", asking: moneyOrDash(lead.price), condition: displayText(lead.bike_condition || lead.damage) || "—", check: vehicleCheckLabel(lead), checkNeedsReview, status: displayLeadStatus(lead), image: image ? <img src={image} alt="" /> : <span className={styles.tableNoPhoto}>No photo</span> };
}

function filterAndSortLeads(leads: DealerVisibleLead[], search: string, sort: string, checkFilter: string) {
  const term = search.trim().toLowerCase();
  return [...leads].filter(lead => {
    const text = [lead.reg, lead.make, lead.model, lead.year, lead.portal_location_label].join(" ").toLowerCase();
    const check = lead.portal_vehicle_check;
    const needsReview = check?.clear === false || check?.flags.some(item => item.state === "warning");
    return (!term || text.includes(term)) && (checkFilter === "all" || (checkFilter === "clear" ? check?.clear === true : needsReview));
  }).sort((a, b) => {
    if (sort === "distance") return (a.portal_distance_miles ?? 999999) - (b.portal_distance_miles ?? 999999);
    if (sort === "asking") return (safeNumber(a.price) ?? 999999999) - (safeNumber(b.price) ?? 999999999);
    return String(b.created_at || b.date || "").localeCompare(String(a.created_at || a.date || ""));
  });
}

function workspaceFacts(lead: DealerVisibleLead, unlocked: boolean, latestNote: DealerLeadNote | null, latestOffer: DealerLeadNote | null): [string, string][] {
  const check = lead.portal_vehicle_check;
  if (unlocked) return [["Status", statusLabel(lead.portal_claim_status || "claimed")], ["Latest offer", latestOffer?.body || "No offer recorded"], ["Last activity", latestNote ? formatLeadDate(latestNote.created_at) : "No activity yet"]];
  return [["Location / Distance", [lead.portal_location_label, lead.portal_distance_label?.replace(" from your dealership", " away")].filter(Boolean).join(" · ") || "Location pending"], ["MOT", check?.mot_expiry ? formatMotDate(check.mot_expiry) : formatReadableDate(lead.mot) || displayText(lead.mot) || "Not supplied"], ["Vehicle Check", vehicleCheckLabel(lead)]];
}

function conditionRows(lead: DealerVisibleLead): [string, string | null | undefined][] {
  return [["Condition", displayText(lead.bike_condition)], ["Service history", displayText(lead.service || lead.history)], ["Finance", displayText(lead.finance_information)], ["Extras / modifications", displayText(lead.extras)], ["Damage", displayText(lead.damage)]];
}

function activeLeads(leads: DealerVisibleLead[]) { return leads.filter(lead => !terminalStatuses.has(String(lead.portal_claim_status))); }
function purchasedLeads(leads: DealerVisibleLead[]) { return leads.filter(lead => ["purchased", "purchased_later"].includes(String(lead.portal_claim_status))); }
function lostLeads(leads: DealerVisibleLead[]) { return leads.filter(lead => ["lost", "returned_to_pool"].includes(String(lead.portal_claim_status))); }
function shellCounts(data: PortalData) { return { available: data.available.length, active: activeLeads(data.claimed).length, purchased: purchasedLeads(data.claimed).length, lost: lostLeads(data.claimed).length }; }
function leadHref(lead: DealerVisibleLead, from = "opportunities", tab?: LeadTab) { return `/dealer-portal/leads/${lead.id}?from=${from}${tab ? `&tab=${tab}` : ""}`; }
function leadTitle(lead: DealerVisibleLead) { return [lead.year, lead.make, lead.model].filter(Boolean).join(" ") || "Motorcycle details pending"; }
function displayLeadStatus(lead: DealerVisibleLead) { return statusLabel(lead.portal_claim_status || lead.status || "New").replace(/^Dealer Pool Available$/i, "New").replace(/^Dealer Allocated$/i, "New"); }
function moneyOrText(value: string | number | null | undefined) { const amount = safeNumber(value); return amount == null ? String(value || "Not supplied") : formatGbp(amount); }
function moneyOrDash(value: string | number | null | undefined) { const amount = safeNumber(value); return amount == null ? "—" : formatGbp(amount); }
function displayEngine(value: string | number | null | undefined) { if (value == null || value === "") return ""; const text = String(value).trim(); return /\bcc\b/i.test(text) ? text : `${text}cc`; }
function dealerInitials(name: string | null | undefined) { const parts = (name || "Dealer").trim().split(/\s+/).filter(Boolean); return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "D").toUpperCase(); }
function paymentLeadTitle(lead: DealerAccountFee["lead"]) { if (!lead) return "Motorcycle purchase"; return `#${lead.id} ${lead.reg || "No reg"} ${[lead.year, lead.make, lead.model].filter(Boolean).join(" ")}`.trim(); }
function isSafeDealerNext(value: string | null) { return Boolean(value && (value === "/dealer-portal" || value.startsWith("/dealer-portal/"))); }
function isLeadTab(value: string | null): value is LeadTab { return value === "overview" || value === "vehicle-check" || value === "mot" || value === "location" || value === "customer"; }
function formatMotDate(value: string | null | undefined) { if (!value) return "Date not returned"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
function formatReadableDate(value: string | number | null | undefined) { if (typeof value !== "string") return ""; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
function displayText(value: string | number | null | undefined) { if (value == null || value === "") return ""; return String(value).replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase()); }
function vehicleCheckLabel(lead: DealerVisibleLead) {
  const check = lead.portal_vehicle_check;
  if (!check) return "Unavailable";
  const needsReview = check.clear === false || check.flags.some(item => item.state === "warning");
  if (needsReview) return "Review";
  if (check.clear === true) return "Clear";
  return displayText(check.status) || "Unavailable";
}
function formatActivityTime(value: string | null | undefined) {
  if (!value) return "Date pending";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatLeadDate(value);
  const today = new Date();
  const sameDay = parsed.toDateString() === today.toDateString();
  return sameDay ? parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function formatActivityStatus(note: DealerLeadNote) {
  const body = String(note.body || "").trim().toLowerCase();
  const statusMatch = body.match(/status changed to ([a-z0-9_-]+)/);
  const code = statusMatch?.[1] || (body.includes("purchase reported") || body.includes("successful purchase") ? "successful_purchase" : note.note_type);
  return lifecycleStatusLabel(code);
}
function lifecycleStatusLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    purchase_reported: "Successful purchase",
    successful_purchase: "Successful purchase",
    purchased: "Successful purchase",
    purchased_later: "Purchased later",
    collection_booked: "Collection booked",
    agreed_to_purchase: "Agreed to purchase",
    returned_to_pool: "Returned to pool",
    attempting_contact: "Attempting contact",
    contacted: "Contacted",
    offer_made: "Offer made",
    negotiating: "Negotiating",
    lost: "Lost",
    note: "Note",
    call: "Call",
    offer: "Offer",
    status: "Status",
  };
  const key = String(value || "").toLowerCase();
  return labels[key] || displayText(key) || "Activity";
}
function dealerDetails(dealer: DealerPortalAccountWithPreferences): [string, string | number | null | undefined][] { return [["Trading name", dealer.trading_name], ["Business/legal name", dealer.limited_company_name], ["Registered address", dealer.registered_address], ["Trading address", dealer.trading_address], ["Postcode", dealer.postcode], ["Website", dealer.website], ["Contact name", dealer.main_contact], ["Email", dealer.main_email], ["Telephone", dealer.telephone || dealer.mobile_whatsapp], ["Dealer status", statusLabel(dealer.account_status)], ["Successful Purchase Fee", `${formatGbp(dealer.successful_purchase_fee)} per purchase`], ["Attribution", `${dealer.attribution_period_days} days`]]; }
function buyingDefaults(dealer: DealerPortalAccountWithPreferences): DealerBuyingPreferences { return dealer.buying_preferences ?? { dealer_account_id: dealer.id, motorcycle_types: [], makes_wanted: [], makes_excluded: [], models_wanted: [], minimum_year: null, maximum_age_years: null, minimum_value: null, maximum_value: null, maximum_mileage: null, minimum_engine_cc: null, maximum_engine_cc: null, accepts_non_running: false, accepts_insurance_category: false, accepts_outstanding_finance: false, accepts_imported: false, accepts_modified: false }; }
function geographyDefaults(dealer: DealerPortalAccountWithPreferences): DealerGeographyPreferences { return dealer.geography_preferences ?? { dealer_account_id: dealer.id, england: true, wales: true, scotland: false, northern_ireland: false, republic_of_ireland: false, maximum_radius_miles: null }; }
function settingLabel(key: string) { return key.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase()); }

function dealerStatusMessage(status: DealerPortalAccount["account_status"], tradingName?: string | null) {
  const dealer = tradingName ? `${tradingName}'s` : "Your";
  if (status === "pending") return `${dealer} MotorGeeks dealer application is awaiting review. Lead access and customer data remain locked until approval.`;
  if (status === "rejected") return `${dealer} MotorGeeks dealer application has not been approved. Lead access and customer data remain unavailable.`;
  if (status === "suspended") return `${dealer} MotorGeeks Dealer Portal access is currently suspended. Lead access, customer data and notifications are unavailable.`;
  return `${dealer} MotorGeeks Dealer Portal access is not currently active.`;
}

function MotorGeeksLogo({ variant = "lockup" }: { variant?: "lockup" | "wordmark" | "wordmarkDark" }) {
  const src = variant === "wordmark" ? "/brand/motorgeeks-wordmark-light.png" : variant === "wordmarkDark" ? "/brand/motorgeeks-wordmark-dark.png" : "/brand/motorgeeks-lockup-dark.png";
  return <div className={`${styles.logo} ${variant === "wordmark" || variant === "wordmarkDark" ? styles.logoWordmark : ""}`}><img src={src} alt="MotorGeeks" /></div>;
}
function MotorGeeksTick() {
  return <svg className={styles.softTick} viewBox="0 0 52 42" aria-hidden="true" focusable="false"><path d="M5 22.5c6.2 7.3 9.8 11.2 11.1 11.2 1.2 0 4-4 9.4-10.1C31 17.3 37.7 10 47 5" /></svg>;
}
function IconShell({ children }: { children: React.ReactNode }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>; }
function HomeIcon() { return <IconShell><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></IconShell>; }
function DocIcon() { return <IconShell><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></IconShell>; }
function TagIcon() { return <IconShell><path d="M20 12 12 20 4 12V4h8z" /><circle cx="9" cy="9" r="1.4" /></IconShell>; }
function BuildingIcon() { return <IconShell><path d="M5 21V5h14v16" /><path d="M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2" /></IconShell>; }
function GearIcon() { return <IconShell><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3.1h5l.4-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1z" /></IconShell>; }
function HelpIcon() { return <IconShell><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.5 2.5 0 1 1 4.5 1.5c-.9.8-1.8 1.2-1.8 2.5" /><path d="M12 17h.01" /></IconShell>; }
function ShieldIcon() { return <IconShell><path d="M12 3 19 6v5c0 4.5-2.8 8.2-7 10-4.2-1.8-7-5.5-7-10V6z" /><path d="m9 12 2 2 4-5" /></IconShell>; }
function ChartIcon() { return <IconShell><path d="M4 20V10" /><path d="M10 20V5" /><path d="M16 20v-8" /><path d="M22 20H2" /><path d="m15 8 2-2 3 3" /></IconShell>; }
function LockIcon() { return <IconShell><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></IconShell>; }
function SupportIcon() { return <IconShell><path d="M4 13a8 8 0 0 1 16 0" /><path d="M5 13h3v5H5z" /><path d="M16 13h3v5h-3z" /><path d="M19 18c0 2-2 3-5 3" /></IconShell>; }
function ClockIcon() { return <IconShell><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></IconShell>; }
function CheckIcon() { return <IconShell><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></IconShell>; }
function LightbulbIcon() { return <IconShell><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8 14a6 6 0 1 1 8 0c-.8.7-1 1.5-1 2H9c0-.5-.2-1.3-1-2z" /></IconShell>; }
function ReturnIcon() { return <IconShell><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-4" /></IconShell>; }
function LocationIcon() { return <IconShell><path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></IconShell>; }
function CameraIcon() { return <IconShell><path d="M5 8h3l1.2-2h5.6L16 8h3v10H5z" /><circle cx="12" cy="13" r="3" /></IconShell>; }
function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={direction === "left" ? "M15 5 8 12l7 7" : "m9 5 7 7-7 7"} /></svg>;
}
function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7 17 17" /><path d="M17 7 7 17" /></svg>;
}
