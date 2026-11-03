import type { MetadataRoute } from "next";
import { absoluteUrl, site } from "./site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Crawlers must be able to read noindex on the tokenless access pages.
    // One-use seller links and API endpoints remain excluded from crawling.
    rules: {
      userAgent: "*",
      allow: ["/", "/seller/recover$", "/seller/verify$", "/seller/invalid$"],
      disallow: ["/api/", "/seller/"]
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: site.url
  };
}
