import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/site-shell";
import { HowItWorksSection, ImageCta } from "../components/sections";
import { absoluteUrl } from "../site";

export const metadata: Metadata = {
  title: "How It Works",
  description: "How MotorGeeks helps motorcycle sellers connect with suitable dealers.",
  alternates: { canonical: absoluteUrl("/how-it-works") }
};

export default function HowItWorksPage() {
  return <PageShell>
    <section className="ml-page-hero how-page"><div className="ml-shell"><span>How MotorGeeks works</span><h1>A simple way to introduce your motorcycle to trusted dealers.</h1><p>Submit useful motorcycle details once, then let MotorGeeks help route the opportunity to suitable buyers.</p><Link className="ml-button ml-button-orange" href="/valuation">Start your valuation <span>→</span></Link></div></section>
    <HowItWorksSection full />
    <ImageCta />
  </PageShell>;
}
