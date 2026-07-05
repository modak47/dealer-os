import type {
  Opportunity,
  OpportunityDisplayStatus,
} from "./types";

export function parseMoney(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(String(value).replace(/[^\d.-]/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatRelativeConfirmed(value: string | null | undefined): string {
  if (!value) return "Never confirmed";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Never confirmed";

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) return "Confirmed just now";

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `Confirmed ${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Confirmed ${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (hours < 48) return "Confirmed yesterday";

  const days = Math.floor(hours / 24);
  return `Confirmed ${days} days ago`;
}

export function getValidAdvertUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function scoreColour(score: number): string {
  if (score >= 90) return "border-green-500/30 bg-green-500/20 text-green-400";
  if (score >= 75) return "border-lime-500/30 bg-lime-500/20 text-lime-400";
  if (score >= 60) return "border-yellow-500/30 bg-yellow-500/20 text-yellow-400";
  return "border-gray-600 bg-gray-700 text-gray-300";
}

const statusColours: Record<OpportunityDisplayStatus, string> = {
  Purchased: "border-green-500/30 bg-green-500/20 text-green-400",
  Contacted: "border-blue-500/30 bg-blue-500/20 text-blue-400",
  Researching: "border-orange-500/30 bg-orange-500/20 text-orange-400",
  Hidden: "border-gray-600 bg-gray-700 text-gray-300",
  Rejected: "border-red-500/30 bg-red-500/20 text-red-400",
  New: "border-purple-500/30 bg-purple-500/20 text-purple-400",
  Seen: "border-cyan-500/30 bg-cyan-500/20 text-cyan-300",
  Negotiating: "border-yellow-500/30 bg-yellow-500/20 text-yellow-300",
};

export function displayStatus(opportunity: Opportunity): OpportunityDisplayStatus {
  if (opportunity.hidden) return "Hidden";
  return opportunity.status ?? "New";
}

export function statusColour(status: OpportunityDisplayStatus): string {
  return statusColours[status];
}

export function opportunityTimestamp(opportunity: Opportunity): number {
  const date = opportunity["First Seen Date"] || opportunity.last_seen;
  const timestamp = date ? new Date(date).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
