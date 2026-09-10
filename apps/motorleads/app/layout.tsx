import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import "./globals.css";
import { site, absoluteUrl } from "./site";

const display = Barlow_Condensed({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "MotorGeeks | Sell your motorcycle through trusted dealers",
    template: "%s | MotorGeeks"
  },
  description: site.description,
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: "MotorGeeks",
    description: site.description,
    url: site.url,
    siteName: "MotorGeeks",
    type: "website",
    images: [{ url: site.assets.socialPreview, width: 1200, height: 630, alt: "MotorGeeks" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "MotorGeeks",
    description: site.description,
    images: [site.assets.socialPreview]
  },
  icons: { icon: site.assets.mgIcon, apple: site.assets.mgIcon }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${display.variable} ${body.variable}`}>
    <body>{children}</body>
  </html>;
}
