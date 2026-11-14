"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OpportunityCard, { AdvertLink, OpportunityNotes } from "./OpportunityCard";
import {
  formatAdvertMoney,
  formatDaysLive,
  formatListingDate,
  formatMoney,
  formatRelativeConfirmed,
  getValidAdvertUrl,
  opportunityTimestamp,
  parseMoney,
} from "./opportunity-utils";
import {
  OPPORTUNITY_STATUSES,
  type Opportunity,
  type OpportunityActivity,
  type OpportunityComparable,
  type OpportunityDrawerSection,
  type OpportunityPatch,
  type OpportunityStatus,
  type ScannerStatus,
  type SortOption,
} from "./types";

import styles from "./opportunities.module.css";
import { useDialogFocus } from "./useDialogFocus";

type OpportunitiesTrackerProps = {
  initialOpportunities: Opportunity[];
  initialScannerStatus: ScannerStatus | null;
  initialError: string | null;
  initialRenderTime: number;
};

export default function OpportunitiesTracker({
  initialOpportunities,
  initialScannerStatus,
  initialError,
  initialRenderTime,
}: OpportunitiesTrackerProps) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [scannerStatus, setScannerStatus] = useState(initialScannerStatus);
  const [error, setError] = useState<string | null>(initialError);
  // Share the server's clock for the first render, including across minute boundaries.
  const [confirmedAtTime, setConfirmedAtTime] = useState(initialRenderTime);
  const [scanning, setScanning] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);
  const [activities, setActivities] = useState<OpportunityActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [drawerSection, setDrawerSection] = useState<OpportunityDrawerSection>("overview");
  const [comparables, setComparables] = useState<OpportunityComparable[]>([]);
  const [comparablesLoading, setComparablesLoading] = useState(false);
  const [comparablesError, setComparablesError] = useState<string | null>(null);
  const comparablesRequestId = useRef(0);
  const [search, setSearch] = useState("");
  const [minMargin, setMinMargin] = useState("");
  const [minScore, setMinScore] = useState("");
  const [hideSeen, setHideSeen] = useState(false);
  const [hideHidden, setHideHidden] = useState(true);
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OpportunityStatus | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("score");

  const updateOpportunity = useCallback(
    async (listingId: number, patch: OpportunityPatch): Promise<boolean> => {
      let rollbackPatch: OpportunityPatch = {};

      setError(null);
      setOpportunities((current) =>
        current.map((opportunity) => {
          if (opportunity["Listing ID"] !== listingId) return opportunity;

          rollbackPatch = Object.fromEntries(
            Object.keys(patch).map((key) => [
              key,
              opportunity[key as keyof OpportunityPatch],
            ]),
          ) as OpportunityPatch;

          return { ...opportunity, ...patch };
        }),
      );

      try {
        const response = await fetch("/api/opportunities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId, ...patch }),
        });
        const result = (await response.json()) as Partial<Opportunity> & { error?: string };

        if (!response.ok) {
          throw new Error(result.error ?? "Unable to update opportunity");
        }

        setOpportunities((current) =>
          current.map((opportunity) =>
            opportunity["Listing ID"] === listingId
              ? { ...opportunity, ...result }
              : opportunity,
          ),
        );

        return true;
      } catch (updateError) {
        setOpportunities((current) =>
          current.map((opportunity) =>
            opportunity["Listing ID"] === listingId
              ? { ...opportunity, ...rollbackPatch }
              : opportunity,
          ),
        );
        setError(
          updateError instanceof Error
            ? updateError.message
            : "Unable to update opportunity",
        );
        return false;
      }
    },
    [],
  );

  const refreshScannerData = useCallback(async () => {
    const [opportunitiesResponse, statusResponse] = await Promise.all([
      fetch("/api/opportunities", { cache: "no-store" }),
      fetch("/api/scanner-status", { cache: "no-store" }),
    ]);

    if (!opportunitiesResponse.ok) throw new Error("Unable to refresh opportunities");

    const nextOpportunities = (await opportunitiesResponse.json()) as Opportunity[];
    setOpportunities(nextOpportunities);
    setConfirmedAtTime(Date.now());

    if (statusResponse.ok) {
      setScannerStatus((await statusResponse.json()) as ScannerStatus);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshScannerData().catch((refreshError: unknown) =>
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : "Unable to refresh opportunities",
        ),
      );
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [refreshScannerData]);

  async function runScan() {
    setScanning(true);
    setError(null);

    try {
      const response = await fetch("/api/run-opportunity-scan", { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to start scan");

      window.setTimeout(() => {
        void refreshScannerData()
          .catch((refreshError: unknown) =>
            setError(
              refreshError instanceof Error
                ? refreshError.message
                : "Unable to refresh opportunities",
            ),
          )
          .finally(() => setScanning(false));
      }, 30_000);
    } catch (scanError) {
      setScanning(false);
      setError(scanError instanceof Error ? scanError.message : "Unable to start scan");
    }
  }

  const loadComparables = useCallback(async (listingId: number) => {
    const requestId = comparablesRequestId.current + 1;
    comparablesRequestId.current = requestId;
    setComparablesLoading(true);
    setComparablesError(null);

    try {
      const response = await fetch(`/api/opportunities/${listingId}/comparables`, {
        cache: "no-store",
      });
      const result = (await response.json()) as OpportunityComparable[] | { error?: string };

      if (!response.ok || !Array.isArray(result)) {
        throw new Error(!Array.isArray(result) ? result.error : "Unable to load comparable adverts");
      }

      if (requestId === comparablesRequestId.current) setComparables(result);
    } catch (comparablesLoadError) {
      if (requestId === comparablesRequestId.current) {
        setComparables([]);
        setComparablesError(
          comparablesLoadError instanceof Error
            ? comparablesLoadError.message
            : "Unable to load comparable adverts",
        );
      }
    } finally {
      if (requestId === comparablesRequestId.current) setComparablesLoading(false);
    }
  }, []);

  async function openOpportunity(
    opportunity: Opportunity,
    section: OpportunityDrawerSection = "overview",
  ) {
    const listingId = opportunity["Listing ID"];
    comparablesRequestId.current += 1;
    setSelectedListingId(listingId);
    setDrawerSection(section);
    setActivities([]);
    setActivitiesLoading(true);
    setComparables([]);
    setComparablesError(null);

    if (section === "comparables") void loadComparables(listingId);

    try {
      const response = await fetch(`/api/opportunities/${listingId}/activity`, {
        method: "POST",
      });
      const result = (await response.json()) as OpportunityActivity[] | { error?: string };

      if (!response.ok || !Array.isArray(result)) {
        throw new Error(!Array.isArray(result) ? result.error : "Unable to load activity");
      }

      setActivities(result);
    } catch (activityError) {
      setError(
        activityError instanceof Error
          ? activityError.message
          : "Unable to load opportunity activity",
      );
    } finally {
      setActivitiesLoading(false);
    }
  }

  function selectDrawerSection(section: OpportunityDrawerSection) {
    setDrawerSection(section);
    if (section === "comparables" && selectedListingId !== null) {
      void loadComparables(selectedListingId);
    }
  }

  const filteredOpportunities = useMemo(() => {
    const term = search.trim().toLowerCase();
    const minimumMargin = minMargin === "" ? null : Number(minMargin);
    const minimumScore = minScore === "" ? null : Number(minScore);

    return opportunities
      .filter((opportunity) => {
        const searchable = [
          opportunity["Make"],
          opportunity["Model"],
          opportunity["Derivative ID"],
          opportunity.notes,
          String(opportunity["Listing ID"]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          (!term || searchable.includes(term)) &&
          (!hideSeen || (opportunity.status ?? "New") !== "Seen") &&
          (!hideHidden || !opportunity.hidden) &&
          (!onlyFavourites || opportunity.favourite) &&
          (statusFilter === "all" || (opportunity.status ?? "New") === statusFilter) &&
          (minimumScore === null || Number(opportunity["Score"] ?? 0) >= minimumScore) &&
          (minimumMargin === null || parseMoney(opportunity["Potential Margin"]) >= minimumMargin)
        );
      })
      .sort((a, b) => {
        if (sortBy === "score") return Number(b["Score"]) - Number(a["Score"]);
        if (sortBy === "margin") {
          return parseMoney(b["Potential Margin"]) - parseMoney(a["Potential Margin"]);
        }
        if (sortBy === "oldest") return opportunityTimestamp(a) - opportunityTimestamp(b);
        if (sortBy === "daysLive") return (b.listingDaysLive ?? -1) - (a.listingDaysLive ?? -1);
        return opportunityTimestamp(b) - opportunityTimestamp(a);
      });
  }, [
    hideHidden,
    hideSeen,
    minMargin,
    minScore,
    onlyFavourites,
    opportunities,
    search,
    sortBy,
    statusFilter,
  ]);

  const stats = useMemo(() => {
    const margins = filteredOpportunities.map((opportunity) =>
      parseMoney(opportunity["Potential Margin"]),
    );
    const scores = filteredOpportunities.map((opportunity) => Number(opportunity["Score"] ?? 0));
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

    return {
      hotLeads: scores.filter((score) => score >= 80).length,
      avgMargin: margins.length ? sum(margins) / margins.length : 0,
      bestMargin: margins.length ? Math.max(...margins) : 0,
      avgScore: scores.length ? sum(scores) / scores.length : 0,
      totalProfit: sum(margins),
    };
  }, [filteredOpportunities]);

  const selectedOpportunity = opportunities.find(
    (opportunity) => opportunity["Listing ID"] === selectedListingId,
  );
  const lastFinished = scannerStatus?.last_finished ?? scannerStatus?.last_run ?? null;
  const lastStarted = scannerStatus?.last_started ?? null;
  const durationSeconds =
    typeof scannerStatus?.duration_ms === "number"
      ? `${Math.round(scannerStatus.duration_ms / 1000)}s`
      : "Unknown";
  const statusLabel = scannerStatus?.status
    ? scannerStatus.status.charAt(0).toUpperCase() + scannerStatus.status.slice(1)
    : "Unknown";

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>Buying tools <span>/</span> Opportunities</p>
            <h1>Buying Opportunities</h1>
            <p className={styles.subtitle}>Find the right stock. Research the market. Make your next move.</p>
          </div>
          <div className={styles.scanAction}>
            <button type="button" onClick={() => void runScan()} disabled={scanning} className={styles.primaryButton}>
              <span aria-hidden="true">↻</span>{scanning ? "Scanner running..." : "Run opportunity scan"}
            </button>
            <span>{opportunities.length.toLocaleString()} opportunities in your workspace</span>
          </div>
        </header>

        {error && (
          <div role="alert" className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
          </div>
        )}

        <section className={styles.summary} aria-label="Opportunity summary">
          <KpiCard title="Hot leads" value={String(stats.hotLeads)} hint="Score of 80 or above" accent />
          <KpiCard title="Average margin" value={formatMoney(stats.avgMargin)} hint="Across these results" />
          <KpiCard title="Best margin" value={formatMoney(stats.bestMargin)} hint="Highest potential return" />
          <KpiCard title="Average score" value={stats.avgScore.toFixed(0)} hint="Out of 100" />
          <KpiCard title="Total potential profit" value={formatMoney(stats.totalProfit)} hint="Before costs and preparation" accent />
        </section>

        {scannerStatus && (
          <section className={styles.scanner} aria-label="Opportunity scanner status">
            <div className={styles.scanState} data-state={scanning ? "running" : scannerStatus.status}>
              <i aria-hidden="true" /><span>Scanner <strong>{scanning ? "Running" : statusLabel}</strong></span>
            </div>
            <div><span>Last started</span><strong>{lastStarted ? new Date(lastStarted).toLocaleString("en-GB") : "Unknown"}</strong></div>
            <div><span>Last finished</span><strong>{lastFinished ? new Date(lastFinished).toLocaleString("en-GB") : "Unknown"}</strong></div>
            <div><span>Duration</span><strong>{durationSeconds}</strong></div>
            {scannerStatus.last_error && <p role="alert" className={styles.scanError}>{scannerStatus.last_error}</p>}
          </section>
        )}

        <section className={styles.filters} aria-label="Opportunity filters">
          <div className={styles.filterFields}>
            <label className={styles.searchField}><span>Search opportunities</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Make, model, notes or listing ID" className={inputClasses} /></label>
            <label><span>Minimum score</span><input type="number" value={minScore} onChange={(event) => setMinScore(event.target.value)} placeholder="Any score" className={inputClasses} /></label>
            <label><span>Minimum margin (£)</span><input type="number" value={minMargin} onChange={(event) => setMinMargin(event.target.value)} placeholder="Any margin" className={inputClasses} /></label>
            <label><span>Workflow status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OpportunityStatus | "all")} className={inputClasses}>
              <option value="all">All statuses</option>
              {OPPORTUNITY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select></label>
          </div>
          <div className={styles.filterOptions}>
            <div className={styles.checkboxes}>
              <FilterCheckbox label="Hide Seen" checked={hideSeen} onChange={setHideSeen} />
              <FilterCheckbox label="Hide Hidden" checked={hideHidden} onChange={setHideHidden} />
              <FilterCheckbox label="Only Favourites" checked={onlyFavourites} onChange={setOnlyFavourites} />
            </div>
            <label className={styles.sortField}><span>Sort by</span><select aria-label="Sort by" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className={inputClasses}>
              <option value="score">Highest score</option><option value="margin">Highest margin</option>
              <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="daysLive">Days live</option>
            </select></label>
          </div>
        </section>

        <div className={styles.resultsHeading}><h2>Your opportunities <span>{filteredOpportunities.length}</span></h2><p>Showing {filteredOpportunities.length} of {opportunities.length} opportunities</p></div>

        <section className={styles.opportunities} aria-label="Opportunities">
          {filteredOpportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity["Listing ID"]}
              opportunity={opportunity}
              confirmedAtTime={confirmedAtTime}
              onOpen={(selected, section) => void openOpportunity(selected, section)}
              onUpdate={updateOpportunity}
            />
          ))}
        </section>

        {filteredOpportunities.length === 0 && (
          <div className={styles.emptyState}><h3>No opportunities match these filters.</h3><p>Try a different search or lower your minimum score and margin.</p></div>
        )}

        {selectedOpportunity && (
          <OpportunityModal
            opportunity={selectedOpportunity}
            activities={activities}
            activitiesLoading={activitiesLoading}
            comparables={comparables}
            comparablesLoading={comparablesLoading}
            comparablesError={comparablesError}
            activeSection={drawerSection}
            onSectionChange={selectDrawerSection}
            onUpdate={updateOpportunity}
            onClose={() => setSelectedListingId(null)}
          />
        )}
      </div>
    </main>
  );
}

const inputClasses =
  styles.input;

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.checkbox}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[#00E51D]" />
      {label}
    </label>
  );
}

function KpiCard({ title, value, hint, accent = false }: { title: string; value: string; hint: string; accent?: boolean }) {
  return <div className={`${styles.kpi} ${accent ? styles.kpiAccent : ""}`}><p>{title}</p><strong>{value}</strong><small>{hint}</small></div>;
}

function OpportunityModal({
  opportunity,
  activities,
  activitiesLoading,
  comparables,
  comparablesLoading,
  comparablesError,
  activeSection,
  onSectionChange,
  onUpdate,
  onClose,
}: {
  opportunity: Opportunity;
  activities: OpportunityActivity[];
  activitiesLoading: boolean;
  comparables: OpportunityComparable[];
  comparablesLoading: boolean;
  comparablesError: string | null;
  activeSection: OpportunityDrawerSection;
  onSectionChange: (section: OpportunityDrawerSection) => void;
  onUpdate: (listingId: number, patch: OpportunityPatch) => Promise<boolean>;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus(onClose);
  const [imageFailed, setImageFailed] = useState(false);

  const details = [
    ["Year", String(opportunity["Year"])],
    ["Mileage", `${opportunity["Mileage"]?.toLocaleString()} miles`],
    ["Seller Type", opportunity["Seller Type"]],
    ["First Seen", formatListingDate(opportunity.listingFirstSeenAt)],
    ["Last Confirmed Live", formatRelativeConfirmed(opportunity.listingLastConfirmedAt)],
    ["Derivative ID", opportunity["Derivative ID"]],
  ];
  const imageUrl = getValidAdvertUrl(opportunity.primary_image_url);
  const listingId = opportunity["Listing ID"];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="opportunity-title"
      className={styles.modalBackdrop}
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className={styles.modal}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h2 id="opportunity-title" className="text-2xl font-bold">{opportunity["Make"]} {opportunity["Model"]}</h2>
            <p>{opportunity["Year"]} · {opportunity["Mileage"] == null ? "Mileage unknown" : `${opportunity["Mileage"].toLocaleString()} miles`} · Listing {listingId}</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className={styles.closeButton} aria-label="Close details">×</button>
          </div>
        </div>

        <div className={styles.modalLayout}>
          <div className={styles.modalMain}>
            <div className={styles.heroImage}>
              {imageUrl && !imageFailed ? (
                // Advert image hosts vary, so this intentionally bypasses next/image host allowlists.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={`${opportunity["Make"]} ${opportunity["Model"]}`} onError={() => setImageFailed(true)} className="h-full w-full object-contain" />
              ) : (
                <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,#173d20,transparent_38%)] text-center text-gray-500">
                  <div><span className="block text-5xl font-black text-white/10">YM</span><small>No advert image available</small></div>
                </div>
              )}
              <div className={styles.heroBadges}><span>Score {opportunity["Score"]}</span>{opportunity["HPI Category"] && <span className={styles.categoryBadge}>{opportunity["HPI Category"]}</span>}</div>
            </div>

        <nav className={styles.detailTabs} aria-label="Opportunity details">
          {(["overview", "comparables", "activity"] as const).map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => onSectionChange(section)}
              aria-current={activeSection === section ? "page" : undefined}
              className={`border-b-2 px-3 py-4 text-sm font-semibold capitalize transition sm:px-5 ${
                activeSection === section
                  ? "border-[#00E51D] text-[#00E51D]"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              {section}
              {section === "comparables" && ` (${opportunity["Comparable Count"] ?? 0})`}
            </button>
          ))}
        </nav>

        <div className={styles.modalContent}>
          {activeSection === "overview" && (
            <section aria-label="Opportunity overview">
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-wider text-[#00E51D]">Opportunity summary</p>
                <h3 className="mt-2 text-xl font-bold">{opportunity["Year"]} {opportunity["Make"]} {opportunity["Model"]}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-400">Review the advert details, research notes and market position before progressing this buying opportunity.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {details.map(([label, value]) => <DetailItem key={label} label={label} value={value} />)}
                <button
                  type="button"
                  onClick={() => onSectionChange("comparables")}
                  className={`${styles.detailItem} ${styles.comparableButton}`}
                >
                  <span className="text-xs uppercase text-gray-500">Comparable Count</span>
                  <span className="mt-2 block font-medium text-[#00E51D] underline decoration-[#00E51D]/40 underline-offset-4">
                    {opportunity["Comparable Count"] ?? 0} comparable adverts
                  </span>
                </button>
              </div>
              <div className="mt-6">
                <OpportunityNotes listingId={listingId} initialNotes={opportunity.notes ?? ""} onSave={onUpdate} />
              </div>
            </section>
          )}

          {activeSection === "comparables" && (
            <section aria-labelledby="comparables-heading">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h3 id="comparables-heading" className="text-lg font-bold">Comparable Adverts</h3>
                  <p className="mt-1 text-sm text-gray-500">Sorted by price, lowest first.</p>
                </div>
                {!comparablesLoading && (
                  <button type="button" onClick={() => onSectionChange("comparables")} className="text-sm font-semibold text-[#00E51D] hover:underline">
                    Refresh
                  </button>
                )}
              </div>

              {comparablesLoading ? (
                <div className="py-16 text-center text-gray-500">Loading comparable adverts...</div>
              ) : comparablesError ? (
                <div role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                  <p>{comparablesError}</p>
                  <button type="button" onClick={() => onSectionChange("comparables")} className="mt-3 font-semibold underline">Try again</button>
                </div>
              ) : comparables.length === 0 ? (
                <div className="mt-5 rounded-xl border border-gray-800 bg-black p-5 text-sm leading-6 text-gray-400">
                  No comparable adverts have been stored for this opportunity yet. Run the opportunity scanner again to collect comparable details.
                </div>
              ) : (
                <div className="mt-5 grid gap-4">
                  {comparables.map((comparable) => (
                    <ComparableAdvert key={comparable.id} comparable={comparable} />
                  ))}
                </div>
              )}
            </section>
          )}

          {activeSection === "activity" && (
            <section aria-labelledby="activity-heading">
              <h3 id="activity-heading" className="text-lg font-bold">Activity Log</h3>
            {activitiesLoading ? (
              <p className="mt-4 text-sm text-gray-500">Loading activity...</p>
            ) : activities.length ? (
              <ol className="mt-4 space-y-4 border-l border-gray-700 pl-5">
                {activities.map((activity) => (
                  <li key={activity.id} className="relative">
                    <span className="absolute -left-[1.45rem] top-1.5 h-2 w-2 rounded-full bg-[#00E51D]" />
                    <time className="text-xs text-gray-500" dateTime={activity.created_at}>
                      {new Date(activity.created_at).toLocaleString("en-GB")}
                    </time>
                    <p className="mt-1 text-sm text-gray-200">{activity.description}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-gray-500">No activity recorded yet.</p>
            )}
            </section>
          )}
        </div>
          </div>

          <aside className={styles.assessment}>
            <p className={styles.eyebrow}>Deal assessment</p><h3 className={styles.assessmentTitle}>The numbers at a glance</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <ModalMetric label="Score" value={String(opportunity["Score"])} accent />
              <ModalMetric label="Potential profit" value={formatAdvertMoney(opportunity["Potential Margin"], "Not enough data")} accent />
              <ModalMetric label="Dealer median" value={formatAdvertMoney(opportunity["Dealer Median"], "Not enough data")} />
              <ModalMetric label="Asking price" value={formatAdvertMoney(opportunity["Asking Price"])} />
              <ModalMetric label="Margin %" value={opportunity["Margin %"]} />
              <ModalMetric label="Comparables" value={String(opportunity["Comparable Count"] ?? 0)} />
              <ModalMetric label="Days Live" value={formatDaysLive(opportunity.listingDaysLive)} />
              <ModalMetric label="Listing ID" value={String(listingId)} />
            </div>

            {opportunity["HPI Category"] && <p className={styles.categoryNotice}><strong>{opportunity["HPI Category"]} recorded</strong>Valuations require at least five comparable bikes in the same category. Clean bikes are excluded.</p>}
            <p className={styles.estimateNote}>Potential profit is an estimate before preparation, fees and other costs.</p>
            <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-gray-400">
              Workflow status
              <select
                value={opportunity.status ?? "New"}
                onChange={(event) => void onUpdate(listingId, { status: event.target.value as OpportunityStatus })}
                className="mt-2 w-full rounded border border-gray-700 bg-black px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#00E51D]"
              >
                {OPPORTUNITY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                aria-pressed={opportunity.favourite}
                onClick={() => void onUpdate(listingId, { favourite: !opportunity.favourite })}
                className={`rounded border px-3 py-3 text-sm font-bold ${opportunity.favourite ? "border-[#00E51D] bg-[#00E51D]/15 text-[#00E51D]" : "border-gray-700 bg-black text-gray-300 hover:border-gray-500"}`}
              >
                {opportunity.favourite ? "★ Favourite" : "☆ Favourite"}
              </button>
              <button
                type="button"
                aria-pressed={opportunity.hidden}
                onClick={() => void onUpdate(listingId, { hidden: !opportunity.hidden })}
                className={`rounded border px-3 py-3 text-sm font-bold ${opportunity.hidden ? "border-red-500/60 bg-red-500/10 text-red-300" : "border-gray-700 bg-black text-gray-300 hover:border-gray-500"}`}
              >
                {opportunity.hidden ? "Hidden" : "Hide"}
              </button>
            </div>

            <AdvertLink url={opportunity["Advert URL"]} className="mt-4 w-full" />
          </aside>
        </div>
      </section>
    </div>
  );
}

function ComparableAdvert({ comparable }: { comparable: OpportunityComparable }) {
  const imageUrl = getValidAdvertUrl(comparable.image_url);

  return (
    <article className={styles.comparableCard}>
      <div className={`grid gap-4 ${imageUrl ? "grid-cols-[5rem_minmax(0,1fr)] sm:grid-cols-[6rem_minmax(0,1fr)]" : "grid-cols-1"}`}>
        {imageUrl && (
          // Scanner image hosts vary, so these thumbnails intentionally bypass next/image host allowlists.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`${comparable.make ?? "Comparable"} ${comparable.model ?? "motorcycle"}`}
            loading="lazy"
            className="h-20 w-20 rounded-lg border border-gray-800 object-cover sm:h-24 sm:w-24"
          />
        )}

        <div className="min-w-0">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div>
              <h4 className="font-bold text-white">
                {[comparable.make, comparable.model].filter(Boolean).join(" ") || "Unknown make / model"}
              </h4>
              <p className="mt-1 text-sm text-gray-400">
                {comparable.year ?? "Year unknown"} • {comparable.mileage === null ? "Mileage unknown" : `${comparable.mileage.toLocaleString()} miles`}
              </p>
            </div>
            <p className="shrink-0 text-xl font-bold text-[#00E51D]">{formatAdvertMoney(comparable.price, "Price unavailable")}</p>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <ComparableDetail label="Seller" value={comparable.seller_type} />
            <ComparableDetail label="Dealer" value={comparable.dealer_name} />
            <ComparableDetail label="Distance" value={comparable.distance} />
          </dl>

          <AdvertLink url={comparable.advert_url} className="mt-4 w-full sm:w-auto" />
        </div>
      </div>
    </article>
  );
}

function ComparableDetail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase text-gray-600">{label}</dt>
      <dd className="mt-1 text-gray-300">{value || "Not available"}</dd>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detailItem}>
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="mt-2 break-words font-medium">{value}</p>
    </div>
  );
}

function ModalMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`${styles.modalMetric} ${accent ? styles.metricAccent : ""}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 break-words text-base font-bold ${accent ? "text-[#00E51D]" : "text-white"}`}>{value || "—"}</p>
    </div>
  );
}
