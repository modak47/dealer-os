"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import OpportunityCard, { AdvertLink } from "./OpportunityCard";
import {
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

type OpportunitiesTrackerProps = {
  initialOpportunities: Opportunity[];
  initialScannerStatus: ScannerStatus | null;
  initialError: string | null;
};

export default function OpportunitiesTracker({
  initialOpportunities,
  initialScannerStatus,
  initialError,
}: OpportunitiesTrackerProps) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [scannerStatus, setScannerStatus] = useState(initialScannerStatus);
  const [error, setError] = useState<string | null>(initialError);
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

  async function refreshScannerData() {
    const [opportunitiesResponse, statusResponse] = await Promise.all([
      fetch("/api/opportunities", { cache: "no-store" }),
      fetch("/api/scanner-status", { cache: "no-store" }),
    ]);

    if (!opportunitiesResponse.ok) throw new Error("Unable to refresh opportunities");

    const nextOpportunities = (await opportunitiesResponse.json()) as Opportunity[];
    setOpportunities(nextOpportunities);

    if (statusResponse.ok) {
      setScannerStatus((await statusResponse.json()) as ScannerStatus);
    }
  }

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
        if (sortBy === "daysLive") return Number(b["Days Live"]) - Number(a["Days Live"]);
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

  return (
    <main className="dealer-module min-h-screen text-white">
      <div className="mx-auto max-w-[1500px] p-4 md:p-8">
        <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <h1 className="text-3xl font-bold md:text-4xl">Buying Opportunities</h1>
            {scannerStatus && (
              <p className="mt-2 text-sm text-gray-400">
                Last Scan: {new Date(scannerStatus.last_run).toLocaleString("en-GB")} •{" "}
                {scannerStatus.opportunity_count} Opportunities
              </p>
            )}
            <p className="mt-2 text-gray-400">
              Source profitable bikes and manage every lead from research to purchase.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runScan()}
            disabled={scanning}
            className="rounded-xl bg-[#00E51D] px-5 py-3 font-bold text-black transition hover:bg-[#00c418] disabled:cursor-wait disabled:opacity-60"
          >
            {scanning ? "Scanner running..." : "Run opportunity scan"}
          </button>
        </header>

        {error && (
          <div role="alert" className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
          </div>
        )}

        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Opportunity summary">
          <KpiCard title="Hot Leads" value={String(stats.hotLeads)} />
          <KpiCard title="Avg Margin" value={formatMoney(stats.avgMargin)} />
          <KpiCard title="Best Margin" value={formatMoney(stats.bestMargin)} />
          <KpiCard title="Avg Score" value={stats.avgScore.toFixed(0)} />
          <KpiCard title="Total Potential Profit" value={formatMoney(stats.totalProfit)} />
        </section>

        <section className="mb-8 rounded-xl border border-gray-800 bg-[#111111] p-4" aria-label="Opportunity filters">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search opportunities..." className={inputClasses} />
            <input type="number" value={minScore} onChange={(event) => setMinScore(event.target.value)} placeholder="Minimum Score" className={inputClasses} />
            <input type="number" value={minMargin} onChange={(event) => setMinMargin(event.target.value)} placeholder="Minimum Margin (£)" className={inputClasses} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OpportunityStatus | "all")} className={inputClasses}>
              <option value="all">All statuses</option>
              {OPPORTUNITY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className={inputClasses}>
              <option value="score">Sort by Score</option>
              <option value="margin">Sort by Potential Margin</option>
              <option value="newest">Sort by Newest</option>
              <option value="oldest">Sort by Oldest</option>
              <option value="daysLive">Sort by Days Live</option>
            </select>
            <FilterCheckbox label="Hide Seen" checked={hideSeen} onChange={setHideSeen} />
            <FilterCheckbox label="Hide Hidden" checked={hideHidden} onChange={setHideHidden} />
            <FilterCheckbox label="Only Favourites" checked={onlyFavourites} onChange={setOnlyFavourites} />
          </div>
        </section>

        <p className="mb-4 text-gray-400">Showing {filteredOpportunities.length} opportunities</p>

        <section className="grid gap-5" aria-label="Opportunities">
          {filteredOpportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity["Listing ID"]}
              opportunity={opportunity}
              onOpen={(selected, section) => void openOpportunity(selected, section)}
              onUpdate={updateOpportunity}
            />
          ))}
        </section>

        {filteredOpportunities.length === 0 && (
          <div className="py-20 text-center text-gray-500">No opportunities match these filters.</div>
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
            onClose={() => setSelectedListingId(null)}
          />
        )}
      </div>
    </main>
  );
}

const inputClasses =
  "w-full rounded-lg border border-gray-700 bg-black px-4 py-3 text-white outline-none placeholder:text-gray-600 focus:border-[#00E51D]";

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
    <label className="flex items-center gap-3 rounded-lg border border-gray-800 bg-black px-4 py-3 text-sm font-medium">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[#00E51D]" />
      {label}
    </label>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-[#111111] p-4">
      <p className="text-sm text-gray-400">{title}</p>
      <p className="mt-1 text-xl font-bold text-[#00E51D] md:text-2xl">{value}</p>
    </div>
  );
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
  onClose: () => void;
}) {
  const details = [
    ["Score", String(opportunity["Score"])],
    ["Potential Margin", opportunity["Potential Margin"]],
    ["Margin %", opportunity["Margin %"]],
    ["Asking Price", opportunity["Asking Price"]],
    ["Dealer Median", opportunity["Dealer Median"]],
    ["Year", String(opportunity["Year"])],
    ["Mileage", `${opportunity["Mileage"]?.toLocaleString()} miles`],
    ["Seller Type", opportunity["Seller Type"]],
    ["Days Live", String(opportunity["Days Live"])],
    ["First Seen", opportunity["First Seen Date"]],
    ["Last Confirmed Live", formatRelativeConfirmed(opportunity.last_seen)],
    ["Derivative ID", opportunity["Derivative ID"]],
  ];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="opportunity-title" className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm" onMouseDown={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-auto border-l border-gray-800 bg-[#111111] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-800 p-6">
          <div>
            <h2 id="opportunity-title" className="text-2xl font-bold">{opportunity["Make"]} {opportunity["Model"]}</h2>
            <p className="text-gray-400">Listing ID: {opportunity["Listing ID"]}</p>
          </div>
          <div className="flex items-center gap-3">
            <AdvertLink url={opportunity["Advert URL"]} className="px-3 py-2 text-sm" />
            <button type="button" onClick={onClose} className="text-2xl text-gray-400 hover:text-white" aria-label="Close details">×</button>
          </div>
        </div>

        <nav className="flex border-b border-gray-800 px-4 sm:px-6" aria-label="Opportunity details">
          {(["overview", "comparables", "activity"] as const).map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => onSectionChange(section)}
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

        <div className="p-6">
          {activeSection === "overview" && (
            <section aria-label="Opportunity overview">
              <div className="grid gap-4 md:grid-cols-2">
                {details.map(([label, value]) => <DetailItem key={label} label={label} value={value} />)}
                <button
                  type="button"
                  onClick={() => onSectionChange("comparables")}
                  className="rounded-xl border border-[#00E51D]/30 bg-black p-4 text-left transition hover:bg-[#00E51D]/5"
                >
                  <span className="text-xs uppercase text-gray-500">Comparable Count</span>
                  <span className="mt-2 block font-medium text-[#00E51D] underline decoration-[#00E51D]/40 underline-offset-4">
                    {opportunity["Comparable Count"] ?? 0} comparable adverts
                  </span>
                </button>
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
      </aside>
    </div>
  );
}

function ComparableAdvert({ comparable }: { comparable: OpportunityComparable }) {
  const imageUrl = getValidAdvertUrl(comparable.image_url);

  return (
    <article className="rounded-xl border border-gray-800 bg-black p-4">
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
            <p className="shrink-0 text-xl font-bold text-[#00E51D]">{comparable.price ?? "Price unavailable"}</p>
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
    <div className="rounded-xl border border-gray-800 bg-black p-4">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="mt-2 break-words font-medium">{value}</p>
    </div>
  );
}
