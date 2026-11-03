import Link from "next/link";
import { PageShell } from "../components/site-shell";
import { HowItWorksSection, ImageCta } from "../components/sections";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("How MotorGeeks Works", "See how to submit your motorcycle, add condition details and photos, receive dealer offers and choose whether to sell.", "/how-it-works");

export default function HowItWorksPage() {
  return <PageShell>
    <section className="ml-page-hero how-page"><div className="ml-shell"><span>How MotorGeeks works</span><h1>A simple way to sell your motorcycle to a trusted dealer.</h1><p>Tell us about your bike once, receive offers from suitable approved dealers and choose whether to accept.</p><Link className="ml-button ml-button-orange" href="/valuation">Start your valuation <span>→</span></Link></div></section>
    <HowItWorksSection full />
    <ImageCta />
  </PageShell>;
}
