import "server-only";

import type { Metadata } from "next";
import { dealership } from "@/config/dealership";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type WebsitePageStatus = "draft" | "published";
export type WebsitePageKind = "builtin" | "managed";

export interface WebsitePageSection {
  key?: string;
  kicker?: string;
  heading: string;
  subtitle?: string;
  body: string;
  image_url?: string;
  image_position?: string;
  cta_label?: string;
  cta_href?: string;
  enabled?: boolean;
  display_order?: number;
  items?: WebsitePageSection[];
}

export interface WebsitePage {
  id?: string;
  slug: string;
  path: string;
  title: string;
  nav_label: string;
  seo_title: string;
  meta_description: string;
  og_image_url: string;
  canonical_path: string;
  hero_kicker: string;
  hero_title: string;
  hero_subtitle: string;
  body_sections: WebsitePageSection[];
  status: WebsitePageStatus;
  page_kind: WebsitePageKind;
  show_in_header: boolean;
  show_in_footer: boolean;
  display_order: number;
}

type WebsitePageRow = Omit<WebsitePage, "body_sections"> & { body_sections: unknown };

const missing = (error: { code?: string } | null | undefined) => ["42P01", "42703", "PGRST205"].includes(error?.code ?? "");
const clean = (value: unknown, fallback = "") => typeof value === "string" ? value.trim() : value === null || value === undefined ? fallback : String(value).trim();
const slugify = (value: string) => clean(value).toLowerCase().replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9/-]+/g, "-").replace(/-+/g, "-").replace(/^\/+|\/+$/g, "") || "new-page";
const pagePath = (slug: string) => slug === "home" ? "/" : `/${slugify(slug)}`;

export const defaultWebsitePages: WebsitePage[] = [
  { slug: "home", path: "/", title: "Home", nav_label: "Home", seo_title: `${dealership.dealerName} | Premium Used Motorcycles`, meta_description: dealership.heroSubtitle, og_image_url: "", canonical_path: "/", hero_kicker: dealership.heroTagline, hero_title: `${dealership.heroHeadlineLine1} ${dealership.heroHeadlineLine2}`, hero_subtitle: dealership.heroSubtitle, body_sections: defaultHomepageSections(), status: "published", page_kind: "builtin", show_in_header: false, show_in_footer: true, display_order: 0 },
  { slug: "used-bikes", path: "/used-bikes", title: "Used Motorcycles", nav_label: "Used Bikes", seo_title: `Used Motorcycles for Sale | ${dealership.dealerName}`, meta_description: "Browse quality used motorcycles for sale at YesMoto. HPI checked, professionally prepared and available with nationwide delivery.", og_image_url: "", canonical_path: "/used-bikes", hero_kicker: "USED MOTORCYCLES", hero_title: "Used motorcycles", hero_subtitle: "Every bike is hand-picked, HPI checked and professionally prepared by our workshop.", body_sections: [], status: "published", page_kind: "builtin", show_in_header: true, show_in_footer: true, display_order: 10 },
];

export function defaultHomepageSections(): WebsitePageSection[] {
  return [
    { key: "style_categories", kicker: "FIND YOUR PERFECT RIDE", heading: "SHOP BY STYLE", subtitle: "Explore quality used motorcycles, carefully selected for every type of rider.", body: "", cta_label: "VIEW ALL MOTORCYCLES", cta_href: "/stock", enabled: true, display_order: 10 },
    { key: "preparation", kicker: "PREPARED PROPERLY", heading: "EVERY BIKE. THOROUGHLY CHECKED.", subtitle: "Every motorcycle at YesMoto goes through a detailed pre-delivery inspection before it is advertised for sale.", body: "", enabled: true, display_order: 20, items: [
      { heading: "Engine & drivetrain", body: "We inspect engine performance, clutch operation, gearbox, cooling system, fluid levels and carry out a full road test.", image_url: "https://images.unsplash.com/photo-1683456062177-f5ddaf6b9f20?auto=format&fit=crop&w=1100&q=86", image_position: "center 48%", enabled: true, display_order: 10 },
      { heading: "Brakes, suspension & steering", body: "Brake discs, pads, suspension components, wheel bearings, steering and handling are checked for safety to MOT standards.", image_url: "https://images.unsplash.com/photo-1707847828334-faf337661922?auto=format&fit=crop&w=1100&q=86", image_position: "center 50%", enabled: true, display_order: 20 },
      { heading: "Electrical & safety systems", body: "Lights, indicators, dashboard, switches, battery, charging system and rider aids are tested before sale.", image_url: "https://images.unsplash.com/photo-1668425104412-0c176d33e986?auto=format&fit=crop&w=1100&q=86", image_position: "center 45%", enabled: true, display_order: 30 },
      { heading: "Tyres & final preparation", body: "Tyres, chain or belt drive, final checks and professional cleaning are completed before handover or delivery.", image_url: "https://images.unsplash.com/photo-1711042818431-1ce87053c080?auto=format&fit=crop&w=1100&q=86", image_position: "center 50%", enabled: true, display_order: 40 },
    ] },
    { key: "featured_stock", heading: "FEATURED BIKES", subtitle: "Hand-picked quality used motorcycles", body: "", cta_label: "VIEW ALL BIKES", cta_href: "/stock", enabled: true, display_order: 30 },
    { key: "services", heading: "Services", body: "", enabled: true, display_order: 40, items: [
      { kicker: "SELL YOUR MOTORCYCLE", heading: "FAIR VALUE. FAST PAYMENT.", body: "Nationwide collection, secure payment and no tyre kickers.", cta_label: "Get a valuation", cta_href: "/sell-my-bike", enabled: true, display_order: 10 },
      { kicker: "FINANCE YOUR NEXT BIKE", heading: "FLEXIBLE FINANCE", body: "Explore motorcycle finance options from our trusted partners.", cta_label: "Explore finance", cta_href: "/finance", enabled: true, display_order: 20 },
      { kicker: "DELIVERED TO YOUR DOOR", heading: "NATIONWIDE DELIVERY", body: "Specialist insured motorcycle transport throughout mainland UK.", cta_label: "Delivery information", cta_href: "/nationwide-delivery", enabled: true, display_order: 30 },
    ] },
    { key: "why_yesmoto", kicker: "WHY YESMOTO", heading: "USED MOTORCYCLES, DONE PROPERLY.", body: "More than 22 years of motorcycle experience goes into how we select, inspect, describe and prepare every bike.", cta_label: "Why buy from YesMoto", cta_href: "/why-buy-from-yesmoto", enabled: true, display_order: 50, items: [
      { heading: "50-100", body: "Detailed photographs on most motorcycles", enabled: true, display_order: 10 },
      { heading: "90%", body: "Customers buying remotely across the UK", enabled: true, display_order: 20 },
      { heading: "6 months", body: "Minimum MOT on every retail motorcycle", enabled: true, display_order: 30 },
      { heading: "3 months", body: "Warranty First cover on qualifying bikes", enabled: true, display_order: 40 },
    ] },
    { key: "recent_stock", heading: "RECENT STOCK", subtitle: "The latest motorcycles available from YesMoto", body: "", cta_label: "BROWSE ALL STOCK", cta_href: "/stock", enabled: true, display_order: 60 },
  ];
}

function normaliseSections(value: unknown): WebsitePageSection[] {
  if (!Array.isArray(value)) return [];
  return value.map((section) => {
    const row = section && typeof section === "object" ? section as Record<string, unknown> : {};
    return {
      key: clean(row.key),
      kicker: clean(row.kicker),
      heading: clean(row.heading),
      subtitle: clean(row.subtitle),
      body: clean(row.body),
      image_url: clean(row.image_url),
      image_position: clean(row.image_position),
      cta_label: clean(row.cta_label),
      cta_href: clean(row.cta_href),
      enabled: row.enabled === false ? false : true,
      display_order: Number(row.display_order) || 0,
      items: normaliseSections(row.items),
    };
  }).filter(section => section.heading || section.body || section.key || section.items?.length);
}

function normalizePage(row: Partial<WebsitePageRow>): WebsitePage {
  const slug = slugify(clean(row.slug) || clean(row.path) || "new-page");
  const sections = normaliseSections(row.body_sections);
  return {
    id: row.id,
    slug,
    path: clean(row.path) || pagePath(slug),
    title: clean(row.title) || "Untitled page",
    nav_label: clean(row.nav_label) || clean(row.title) || "Page",
    seo_title: clean(row.seo_title),
    meta_description: clean(row.meta_description),
    og_image_url: clean(row.og_image_url),
    canonical_path: clean(row.canonical_path) || pagePath(slug),
    hero_kicker: clean(row.hero_kicker),
    hero_title: clean(row.hero_title) || clean(row.title) || "Untitled page",
    hero_subtitle: clean(row.hero_subtitle),
    body_sections: slug === "home" && !sections.length ? defaultHomepageSections() : sections,
    status: row.status === "draft" ? "draft" : "published",
    page_kind: row.page_kind === "builtin" ? "builtin" : "managed",
    show_in_header: Boolean(row.show_in_header),
    show_in_footer: Boolean(row.show_in_footer),
    display_order: Number(row.display_order) || 100,
  };
}

export function sanitiseWebsitePage(input: Record<string, unknown>): WebsitePage {
  const slug = slugify(clean(input.slug) || clean(input.path) || clean(input.title));
  const sections = normaliseSections(input.body_sections);
  return normalizePage({
    slug,
    path: clean(input.path) || pagePath(slug),
    title: clean(input.title, "Untitled page"),
    nav_label: clean(input.nav_label),
    seo_title: clean(input.seo_title),
    meta_description: clean(input.meta_description),
    og_image_url: clean(input.og_image_url),
    canonical_path: clean(input.canonical_path) || pagePath(slug),
    hero_kicker: clean(input.hero_kicker),
    hero_title: clean(input.hero_title),
    hero_subtitle: clean(input.hero_subtitle),
    body_sections: slug === "home" && !sections.length ? defaultHomepageSections() : sections,
    status: input.status === "draft" ? "draft" : "published",
    page_kind: input.page_kind === "builtin" ? "builtin" : "managed",
    show_in_header: Boolean(input.show_in_header),
    show_in_footer: Boolean(input.show_in_footer),
    display_order: Number(input.display_order) || 100,
  });
}

export async function listWebsitePages() {
  try {
    const { data, error } = await getSupabaseAdmin().from("website_pages").select("*").order("display_order");
    if (error) return { pages: defaultWebsitePages, migrationReady: !missing(error), error: error.message };
    return { pages: (data ?? []).map(row => normalizePage(row as WebsitePageRow)), migrationReady: true };
  } catch (error) {
    return { pages: defaultWebsitePages, migrationReady: false, error: error instanceof Error ? error.message : "Unable to load website pages." };
  }
}

export async function getWebsitePageBySlug(slug: string, includeDraft = false) {
  const cleanSlug = slugify(slug);
  try {
    let query = getSupabaseAdmin().from("website_pages").select("*").eq("slug", cleanSlug);
    if (!includeDraft) query = query.eq("status", "published");
    const { data, error } = await query.maybeSingle();
    if (error) return { page: defaultWebsitePages.find(page => page.slug === cleanSlug) ?? null, migrationReady: !missing(error), error: error.message };
    return { page: data ? normalizePage(data as WebsitePageRow) : defaultWebsitePages.find(page => page.slug === cleanSlug) ?? null, migrationReady: true };
  } catch (error) {
    return { page: defaultWebsitePages.find(page => page.slug === cleanSlug) ?? null, migrationReady: false, error: error instanceof Error ? error.message : "Unable to load website page." };
  }
}

export async function getWebsitePageByPath(path: string) {
  const cleanPath = path === "/" ? "/" : `/${slugify(path)}`;
  try {
    const { data, error } = await getSupabaseAdmin().from("website_pages").select("*").eq("path", cleanPath).eq("status", "published").maybeSingle();
    if (error) return defaultWebsitePages.find(page => page.path === cleanPath) ?? null;
    return data ? normalizePage(data as WebsitePageRow) : defaultWebsitePages.find(page => page.path === cleanPath) ?? null;
  } catch {
    return defaultWebsitePages.find(page => page.path === cleanPath) ?? null;
  }
}

export function metadataFromWebsitePage(page: WebsitePage | null, fallback: { title: string; description?: string; path?: string; image?: string }): Metadata {
  const title = page?.seo_title || fallback.title;
  const description = page?.meta_description || fallback.description || dealership.heroSubtitle;
  const path = page?.canonical_path || fallback.path || page?.path || "/";
  const image = page?.og_image_url || fallback.image;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}
