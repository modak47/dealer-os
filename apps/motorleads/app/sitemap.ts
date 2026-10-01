import type { MetadataRoute } from "next";
import { absoluteUrl } from "./site";

const routes = [
  "/",
  "/sell-my-motorbike",
  "/motorbike-valuation",
  "/how-to-sell-a-motorbike",
  "/motorcycle-brands",
  "/sell-my-honda-motorbike",
  "/sell-my-yamaha-motorbike",
  "/sell-my-bmw-motorcycle",
  "/sell-my-piaggio-scooter",
  "/sell-my-suzuki-motorbike",
  "/sell-my-kawasaki-motorbike",
  "/sell-my-triumph-motorcycle",
  "/sell-my-harley-davidson",
  "/sell-my-ktm-motorcycle",
  "/sell-my-royal-enfield",
  "/how-it-works",
  "/for-dealers",
  "/about",
  "/faq",
  "/contact",
  "/dealer-access",
  "/valuation",
  "/privacy",
  "/terms",
  "/cookies"
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map(route => ({
    url: absoluteUrl(route),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : ["/valuation", "/sell-my-motorbike", "/motorbike-valuation"].includes(route) ? .9 : route === "/motorcycle-brands" ? .8 : .7
  }));
}
