import type { Metadata } from "next";

export const site = {
  name: "MotorGeeks",
  tagline: "CONNECTING SELLERS WITH TRUSTED DEALERS.",
  url: (process.env.NEXT_PUBLIC_MOTORGEEKS_SITE_URL || process.env.NEXT_PUBLIC_MOTORLEADS_SITE_URL || "https://motorgeeks.co.uk").replace(/\/+$/, ""),
  dealerLoginUrl: process.env.NEXT_PUBLIC_DEALER_PORTAL_LOGIN_URL || "https://portal.motorgeeks.co.uk/dealer-login",
  valuationUrl: process.env.NEXT_PUBLIC_MOTORGEEKS_VALUATION_URL || process.env.NEXT_PUBLIC_MOTORLEADS_VALUATION_URL || "/valuation",
  description: "Sell your motorbike through MotorGeeks and receive offers from approved motorcycle dealers across the UK.",
  contactEmail: "info@motorgeeks.co.uk",
  adminEmail: process.env.MOTORGEEKS_ENQUIRY_RECIPIENT || process.env.MOTORLEADS_ENQUIRY_RECIPIENT || "hello@motorgeeks.co.uk",
  colours: {
    motorBlue: "#0085F5",
    deepNavy: "#061326",
    accentCyan: "#00B9ED",
    white: "#FFFFFF",
  },
  assets: {
    lockupDark: "/brand/motorgeeks-original-transparent.png",
    lockupLight: "/brand/motorgeeks-lockup-light.png",
    wordmarkDark: "/brand/motorgeeks-wordmark-dark.png",
    wordmarkLight: "/brand/motorgeeks-wordmark-light.png",
    mgIcon: "/brand/motorgeeks-mg-icon.png",
    socialPreview: "/brand/motorgeeks-social-preview.png",
  },
};

export function absoluteUrl(path = "/") {
  if (/^https?:\/\//i.test(path)) return path;
  return `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
}

export function pageMetadata(title: string, description: string, path: string): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | MotorGeeks`,
      description,
      url,
      siteName: site.name,
      type: "website",
      images: [{ url: site.assets.socialPreview, width: 1200, height: 630, alt: "MotorGeeks - connecting motorcycle sellers with trusted dealers" }]
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | MotorGeeks`,
      description,
      images: [site.assets.socialPreview]
    }
  };
}
