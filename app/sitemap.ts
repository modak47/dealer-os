import type { MetadataRoute } from "next";
import { getPublicStockBikes } from "@/lib/stock";
import { listWebsitePages } from "@/lib/website-pages";
import { absoluteUrl } from "@/lib/site-url";

export const revalidate = 900;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ pages }, bikes] = await Promise.all([listWebsitePages(), getPublicStockBikes()]);
  const pageRoutes = pages
    .filter((page) => page.status === "published")
    .map((page) => ({
      url: absoluteUrl(page.canonical_path || page.path),
      lastModified: new Date(),
      changeFrequency: page.path === "/" ? "daily" as const : "weekly" as const,
      priority: page.path === "/" ? 1 : page.path === "/used-bikes" ? 0.9 : 0.7,
    }));

  const bikeRoutes = bikes.map((bike) => ({
    url: absoluteUrl(`/used-bikes/${bike.slug}`),
    lastModified: bike.createdTime ? new Date(bike.createdTime) : new Date(),
    changeFrequency: "daily" as const,
    priority: bike.status === "In Stock" ? 0.85 : 0.65,
    images: bike.photoReady ? bike.imageUrls.filter((image) => !image.includes("bike-placeholder")).map(absoluteUrl) : undefined,
  }));

  return [...pageRoutes, ...bikeRoutes];
}
