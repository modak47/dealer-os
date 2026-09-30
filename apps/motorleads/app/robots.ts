import type { MetadataRoute } from "next";
import { absoluteUrl, site } from "./site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/seller/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: site.url
  };
}
