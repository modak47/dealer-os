"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  displayStatus,
  formatDaysLive,
  formatAdvertMoney,
  formatRelativeConfirmed,
  getValidAdvertUrl,
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

import styles from "./opportunities.module.css";
import { useDialogFocus } from "./useDialogFocus";

type SaveState = "idle" | "saving" | "saved" | "error";

type OpportunityCardProps = {
  opportunity: Opportunity;
  confirmedAtTime: number;
  onOpen: (opportunity: Opportunity, section?: OpportunityDrawerSection) => void;
  onUpdate: (listingId: number, patch: OpportunityPatch) => Promise<boolean>;
};

export default function OpportunityCard({ opportunity, confirmedAtTime, onOpen, onUpdate }: OpportunityCardProps) {
  const listingId = opportunity["Listing ID"];
  const status = displayStatus(opportunity);
  const [showImage, setShowImage] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const imageUrl = getValidAdvertUrl(opportunity.primary_image_url);
  const hasImage = Boolean(imageUrl && failedImage !== imageUrl);
  const title = `${opportunity["Make"]} ${opportunity["Model"]}`;

  return (
    <article className={styles.card} onClick={() => onOpen(opportunity)} aria-label={title}>
      <div className={styles.cardMain}>
        <button
          type="button"
          className={styles.thumbnail}
          disabled={!hasImage}
          aria-label={hasImage ? `Enlarge photo of ${title}` : `No photo available for ${title}`}
          onClick={(event) => { event.stopPropagation(); setShowImage(true); }}
        >
          {hasImage ? (
            // Advert image hosts vary, so these images intentionally bypass host allowlists.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl!} alt={title} loading="lazy" onError={() => setFailedImage(imageUrl)} />
          ) : <span className={styles.noPhoto}><span aria-hidden="true">◇</span>No photo available</span>}
          {hasImage && <span className={styles.photoHint}>View photo ↗</span>}
        </button>

        <div className={styles.cardBody}>
          <div className={styles.cardHeading}>
            <div>
              <h2><button type="button" className={styles.titleButton} onClick={(event) => { event.stopPropagation(); onOpen(opportunity); }}>{title}</button></h2>
              <p className={styles.vehicleMeta}>{opportunity["Year"] || "Year unknown"}<span>•</span>{opportunity["Mileage"] == null ? "Mileage unknown" : `${opportunity["Mileage"].toLocaleString()} miles`}</p>
            </div>
            <div className={styles.badges}>
              <span className={`${styles.badge} ${statusColour(status)}`}>{status === "New" ? "Not reviewed" : status}</span>
              {opportunity.isNewListing && <span className={`${styles.badge} ${styles.newBadge}`}>New listing</span>}
              {opportunity["HPI Category"] && <span className={`${styles.badge} ${styles.categoryBadge}`}>{opportunity["HPI Category"]}</span>}
              <span className={`${styles.badge} ${scoreColour(Number(opportunity["Score"]))}`}>Score {opportunity["Score"]}</span>
            </div>
          </div>

          <div className={styles.financials}>
            <InfoLabel label="Asking price" value={formatAdvertMoney(opportunity["Asking Price"])} />
            <InfoLabel label="Dealer median" value={formatAdvertMoney(opportunity["Dealer Median"], "Not enough data")} />
            <div className={styles.profit}>
              <span>Potential profit</span>
              <strong>{formatAdvertMoney(opportunity["Potential Margin"], "Not enough data")}</strong>
            </div>
          </div>
          <div className={styles.cardFacts}>
            <ComparableCount count={Number(opportunity["Comparable Count"] ?? 0)} onClick={() => onOpen(opportunity, "comparables")} />
            <InfoLabel label="Days live" value={formatDaysLive(opportunity.listingDaysLive)} />
            <InfoLabel label="Seller" value={opportunity["Seller Type"] || "Unknown"} />
            <InfoLabel label="Last confirmed" value={formatRelativeConfirmed(opportunity.listingLastConfirmedAt, confirmedAtTime)} />
          </div>
        </div>
      </div>

      <div className={styles.cardFooter}>
        <OpportunityNotes listingId={listingId} initialNotes={opportunity.notes ?? ""} onSave={onUpdate} />
        <div className={styles.cardActions}>
          <label className={styles.workflow} onClick={(event) => event.stopPropagation()}>
            <span>Workflow status</span>
            <select value={opportunity.status ?? "New"} onChange={(event) => void onUpdate(listingId, { status: event.target.value as OpportunityStatus })}>
              {OPPORTUNITY_STATUSES.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <div className={styles.actionButtons}>
            <button type="button" className={styles.secondaryButton} aria-pressed={opportunity.favourite} aria-label={opportunity.favourite ? "Remove from favourites" : "Add to favourites"}
              onClick={(event) => { event.stopPropagation(); void onUpdate(listingId, { favourite: !opportunity.favourite }); }}>
              {opportunity.favourite ? "★ Favourite" : "☆ Favourite"}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={(event) => { event.stopPropagation(); void onUpdate(listingId, { hidden: !opportunity.hidden }); }}>{opportunity.hidden ? "Restore" : "Hide"}</button>
            <button type="button" className={styles.secondaryButton} onClick={(event) => { event.stopPropagation(); onOpen(opportunity); }}>View details ↗</button>
            <AdvertLink url={opportunity["Advert URL"]} />
          </div>
        </div>
      </div>
      {showImage && hasImage && <PhotoPreview url={imageUrl!} title={title} onClose={() => setShowImage(false)} />}
    </article>
  );
}

function PhotoPreview({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const dialogRef = useDialogFocus(onClose);
  return <div className={styles.photoBackdrop} onClick={event => { event.stopPropagation(); onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Photo of ${title}`} tabIndex={-1} className={styles.photoDialog} onClick={event => event.stopPropagation()}>
      <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close photo">×</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={title} />
    </section>
  </div>;
}

export const OpportunityNotes = memo(function OpportunityNotes({
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
    <label className={styles.notes} onClick={(event) => event.stopPropagation()}>
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
        rows={2}
        className="w-full resize-y rounded-xl border border-gray-700 bg-black px-4 py-3 text-white outline-none transition placeholder:text-gray-600 focus:border-[#00E51D]"
      />
    </label>
  );
}, (previous, next) =>
  previous.listingId === next.listingId && previous.onSave === next.onSave,
);

export function AdvertLink({ url, className = "" }: { url: string | null | undefined; className?: string }) {
  const validUrl = getValidAdvertUrl(url);
  const classes = `${styles.advertLink} ${className}`;

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
    <div className={styles.fact}><span>{label}</span><strong>{value}</strong></div>
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
      className={`${styles.fact} ${styles.comparableButton}`}
      aria-label={`View ${count} comparable advert${count === 1 ? "" : "s"}`}
    >
      <span className="block text-xs uppercase text-gray-500">Comparables</span>
      <span className="mt-1 block text-sm font-semibold text-[#00E51D] underline decoration-[#00E51D]/40 underline-offset-4">
        {count} advert{count === 1 ? "" : "s"}
      </span>
    </button>
  );
}
