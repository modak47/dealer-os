import { WEBSITE_LEAD_STATUSES, type WebsiteLead, type WebsiteLeadStatus } from "@/types/website-lead";

const currencyFormatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function formatGbp(value: number | string | null | undefined): string {
  const number = safeNumber(value);
  return number === null ? "Not set" : currencyFormatter.format(number);
}

export function formatLeadDate(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = parseLeadDate(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : dateFormatter.format(date);
}

function parseLeadDate(value: string) {
  const trimmed = value.trim();
  const ukDate = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (ukDate) {
    const day = Number(ukDate[1]);
    const month = Number(ukDate[2]);
    const rawYear = Number(ukDate[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const hour = Number(ukDate[4] ?? 0);
    const minute = Number(ukDate[5] ?? 0);
    return new Date(year, month - 1, day, hour, minute);
  }
  return new Date(trimmed);
}

export function formatMileage(value: string | number | null | undefined): string {
  const number = safeNumber(value);
  return number === null ? "Not recorded" : `${number.toLocaleString("en-GB")} miles`;
}

export function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[£,\s]/g, "");
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

export function cleanText(value: unknown, max = 2000): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : null;
}

export function statusLabel(status: string | null | undefined): string {
  return (status || "new").replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

export function isValidLeadStatus(value: string | null | undefined): value is WebsiteLeadStatus {
  return WEBSITE_LEAD_STATUSES.includes(value as WebsiteLeadStatus);
}

export function statusBadgeClass(status: string | null | undefined): string {
  const key = status || "new";
  if (key === "new") return "website-badge badge-new";
  if (key === "reviewing") return "website-badge badge-reviewing";
  if (key === "contacted") return "website-badge badge-contacted";
  if (key === "offer_made" || key === "accepted") return "website-badge badge-offer";
  if (key === "purchased") return "website-badge badge-purchased";
  if (key === "declined" || key === "closed") return "website-badge badge-closed";
  return "website-badge";
}

export function extractLegacyImageUrls(value: string | null | undefined): string[] {
  if (!value) return [];
  const urls = value.match(/https?:\/\/[^\s"'<>),]+/gi) ?? [];
  const fragments = value.split(/[\n,;|\t ]+/).filter(part => /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(part));
  return [...urls, ...fragments];
}

const defaultLegacyImageBaseUrl = "https://sellyourmotorbike.co.uk";

export function resolveLegacyImagePath(value: string, baseUrl = process.env.LEGACY_LEADS_IMAGE_BASE_URL ?? defaultLegacyImageBaseUrl): string | null {
  const image = value.trim();
  if (!image) return null;
  if (/^https?:\/\//i.test(image)) return image;
  if (!baseUrl) return null;
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(image.replace(/^\/+/, ""), base).toString();
}

function imageExtension(value: string) {
  const pathname = (() => {
    try {
      return new URL(value).pathname;
    } catch {
      return value.split("?")[0];
    }
  })();
  return pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? null;
}

function displayableLeadImageUrl(value: string) {
  const extension = imageExtension(value);
  if (!extension) return value;
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"].includes(extension)) return value;
  if (["heic", "heif"].includes(extension)) return `/api/website-leads/image?url=${encodeURIComponent(value)}`;
  return null;
}

export function combineLeadImages(lead: Pick<WebsiteLead, "images" | "Images" | "image1" | "image2" | "image3" | "image4" | "image5" | "image6" | "image7" | "image8" | "image9" | "image10">, legacyBaseUrl?: string): string[] {
  const jsonImages = Array.isArray(lead.images) ? lead.images : [];
  const numbered = [lead.image1, lead.image2, lead.image3, lead.image4, lead.image5, lead.image6, lead.image7, lead.image8, lead.image9, lead.image10];
  const legacy = extractLegacyImageUrls(lead.Images);
  const seen = new Set<string>();
  return [...jsonImages, ...numbered, ...legacy].flatMap(value => {
    if (typeof value !== "string") return [];
    const resolved = resolveLegacyImagePath(value, legacyBaseUrl);
    if (!resolved || seen.has(resolved)) return [];
    const displayUrl = displayableLeadImageUrl(resolved);
    if (!displayUrl) return [];
    seen.add(resolved);
    return [displayUrl];
  });
}

export function customerName(lead: Pick<WebsiteLead, "fname" | "lname">): string {
  return [lead.fname, lead.lname].filter(Boolean).join(" ") || "Unknown customer";
}
