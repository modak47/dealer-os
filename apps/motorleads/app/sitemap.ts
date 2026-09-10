import type { MetadataRoute } from "next";
import { absoluteUrl } from "./site";

const routes = ["/", "/how-it-works", "/for-dealers", "/about", "/faq", "/contact", "/dealer-access", "/valuation", "/privacy", "/terms", "/cookies"];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map(route => ({
    url: absoluteUrl(route),
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/valuation" || route === "/for-dealers" ? .9 : .7
  }));
}
