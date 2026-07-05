"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  displayStatus,
  formatMoney,
  formatRelativeConfirmed,
  getValidAdvertUrl,
  parseMoney,
  scoreColour,
  statusColour,
} from "./opportunity-utils";
import {
  OPPORTUNITY_STATUSES,
  type Opportunity,
  type OpportunityDrawerSection,
  type OpportunityPatch,
  type OpportunityStatus,
} from "./types";

type SaveState = "idle" | "saving" | "saved" | "error";

type OpportunityCardProps = {
  opportunity: Opportunity;
  onOpen: (opportunity: Opportunity, section?: OpportunityDrawerSection) => void;
  onUpdate: (listingId: number, patch: OpportunityPatch) => Promise<boolean>;
};

export default function OpportunityCard({ opportunity, onOpen, onUpdate }: OpportunityCardProps) {
  const listingId = opportunity["Listing ID"];
  const status = displayStatus(opportunity);
  const [showImage, setShowImage] = useState(false);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(opportunity)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen(opportunity);
        }
      }}
      className="cursor-pointer rounded-2xl border border-gray-800 bg-[#111111] p-5 transition hover:border-[#00E51D]/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00E51D] md:p-6"
    >
    
                <div className="flex flex-col gap-5">

                  <div className="grid gap-4 lg:grid-cols-[150px_minmax(0,1fr)]">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowImage(true);
                      }}
                      className="group overflow-hidden rounded-2xl border border-gray-800 bg-black"
                    >
                      {opportunity.primary_image_url ? (
                        <img
                          src={opportunity.primary_image_url}
                          alt={`${opportunity["Make"]} ${opportunity["Model"]}`}
                          className="h-[150px] w-full object-cover transition duration-200 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-[150px] w-full items-center justify-center text-sm text-gray-500">
                          No photo
                        </div>
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                        <div>
                          <h2 className="text-xl font-bold hover:text-[#00E51D]">
                            {opportunity["Make"]} {opportunity["Model"]}
                          </h2>
                          <p className="mt-1 text-gray-400">
                            {opportunity["Year"]} • {opportunity["Mileage"]?.toLocaleString()} miles
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusColour(status)}`}>
                            {status}
                          </span>
                          <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${scoreColour(Number(opportunity["Score"]))}`}>
                            Score {opportunity["Score"]}
                          </span>
                          {opportunity["HPI Category"] && (
                            <span className="rounded-full border border-zinc-600 bg-zinc-700 px-3 py-1 text-sm font-bold text-zinc-300">
                              {opportunity["HPI Category"]}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 border-y border-gray-800 py-3 text-sm md:grid-cols-4 xl:grid-cols-7">
                        <InfoLabel label="Asking" value={formatMoney(parseMoney(opportunity["Asking Price"]))} />
                        <InfoLabel label="Dealer Median" value={formatMoney(parseMoney(opportunity["Dealer Median"]))} />
                        <div className="rounded-xl border border-[#00E51D]/30 bg-[#00E51D]/10 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-green-300">Profit</p>
                          <p className="mt-1 text-lg font-bold text-[#00E51D]">
                            {formatMoney(parseMoney(opportunity["Potential Margin"]))}
                          </p>
                        </div>
                        <ComparableCount
                          count={Number(opportunity["Comparable Count"] ?? 0)}
                          onClick={() => onOpen(opportunity, "comparables")}
                        />
                        <InfoLabel label="Days Live" value={String(opportunity["Days Live"])} />
                        <InfoLabel label="Seller" value={opportunity["Seller Type"]} />
                        <InfoLabel label="Last Confirmed" value={formatRelativeConfirmed(opportunity.last_seen)} />
                      </div>
                    </div>
                  </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <OpportunityNotes listingId={listingId} initialNotes={opportunity.notes ?? ""} onSave={onUpdate} />

          <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label className="block" onClick={(event) => event.stopPropagation()}>
              <span className="mb-2 block text-sm font-medium text-gray-300">Workflow status</span>
              <select
                value={opportunity.status ?? "New"}
                onChange={(event) => void onUpdate(listingId, { status: event.target.value as OpportunityStatus })}
                className="w-full rounded-xl border border-gray-700 bg-black px-4 py-3 text-white outline-none focus:border-[#00E51D]"
              >
                {OPPORTUNITY_STATUSES.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void onUpdate(listingId, { favourite: !opportunity.favourite });
                }}
                className={`rounded-xl border px-4 py-3 font-semibold transition ${
                  opportunity.favourite
                    ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
                    : "border-gray-700 bg-black text-gray-300 hover:border-yellow-500/50 hover:text-yellow-400"
                }`}
                aria-pressed={opportunity.favourite}
                aria-label={opportunity.favourite ? "Remove from favourites" : "Add to favourites"}
              >
                {opportunity.favourite ? "★ Favourite" : "☆ Favourite"}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void onUpdate(listingId, { hidden: !opportunity.hidden });
                }}
                className="rounded-xl border border-gray-700 bg-black px-4 py-3 font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white"
              >
                {opportunity.hidden ? "Restore" : "Hide"}
              </button>
            </div>

            <AdvertLink url={opportunity["Advert URL"]} className="sm:col-span-2 lg:col-span-1" />
          </div>
        </div>
      </div>

      {showImage && opportunity.primary_image_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          onClick={(event) => {
            event.stopPropagation();
            setShowImage(false);
          }}
        >
          <img
            src={opportunity.primary_image_url}
            alt={`${opportunity["Make"]} ${opportunity["Model"]}`}
            className="max-h-full max-w-full rounded-2xl object-contain"
          />
        </div>
      )}


    </article>
  );
}

const OpportunityNotes = memo(function OpportunityNotes({
  listingId,
  initialNotes,
  onSave,
}: {
  listingId: number;
  initialNotes: string;
  onSave: (listingId: number, patch: OpportunityPatch) => Promise<boolean>;
}) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timeoutRef = useRef<number | null>(null);
  const draftRef = useRef(initialNotes);
  const lastSavedRef = useRef(initialNotes);
  const editVersionRef = useRef(0);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  function scheduleSave(value: string) {
    draftRef.current = value;
    editVersionRef.current += 1;
    const editVersion = editVersionRef.current;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);

    setSaveState("saving");
    timeoutRef.current = window.setTimeout(async () => {
      const draft = draftRef.current;
      if (draft === lastSavedRef.current) {
        setSaveState("saved");
        return;
      }

      const saved = await onSave(listingId, { notes: draft });
      if (saved) {
        lastSavedRef.current = draft;
        if (editVersion === editVersionRef.current) setSaveState("saved");
      } else if (editVersion === editVersionRef.current) {
        setSaveState("error");
      }
    }, 1000);
  }

  return (
    <label className="block" onClick={(event) => event.stopPropagation()}>
      <span className="mb-2 flex min-h-5 items-center justify-between text-sm font-medium text-gray-300">
        Notes
        <span className="text-xs text-gray-500" aria-live="polite">
          {saveState === "saving" && "Saving..."}
          {saveState === "saved" && "Saved ✓"}
          {saveState === "error" && "Could not save — keep typing to retry"}
        </span>
      </span>
      <textarea
        defaultValue={initialNotes}
        onChange={(event) => scheduleSave(event.currentTarget.value)}
        placeholder="Add research, seller details, or next steps..."
        rows={5}
        className="w-full resize-y rounded-xl border border-gray-700 bg-black px-4 py-3 text-white outline-none transition placeholder:text-gray-600 focus:border-[#00E51D]"
      />
    </label>
  );
}, (previous, next) =>
  previous.listingId === next.listingId && previous.onSave === next.onSave,
);

export function AdvertLink({ url, className = "" }: { url: string | null | undefined; className?: string }) {
  const validUrl = getValidAdvertUrl(url);
  const classes = `inline-flex items-center justify-center rounded-xl border px-4 py-3 font-semibold transition ${className}`;

  if (!validUrl) {
    return (
      <button type="button" disabled title="No valid advert URL is available" className={`${classes} cursor-not-allowed border-gray-800 bg-black text-gray-600`}>
        Open Advert
      </button>
    );
  }

  return (
    <a
      href={validUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={`${classes} border-[#00E51D]/40 bg-[#00E51D]/10 text-[#00E51D] hover:bg-[#00E51D]/20`}
    >
      Open Advert
    </a>
  );
}

function InfoLabel({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function ComparableCount({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="text-left rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#00E51D]"
      aria-label={`View ${count} comparable advert${count === 1 ? "" : "s"}`}
    >
      <span className="block text-xs uppercase text-gray-500">Comparables</span>
      <span className="mt-1 block text-sm font-semibold text-[#00E51D] underline decoration-[#00E51D]/40 underline-offset-4">
        {count} advert{count === 1 ? "" : "s"}
      </span>
    </button>
  );
}
