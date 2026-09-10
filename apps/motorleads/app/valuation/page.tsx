import type { Metadata } from "next";
import { Icon } from "../components/icons";
import { PageShell } from "../components/site-shell";
import { ValuationCta } from "../components/valuation-cta";
import { absoluteUrl } from "../site";

export const metadata: Metadata = {
  title: "Motorcycle Valuation",
  description: "Start a MotorGeeks motorcycle valuation.",
  alternates: { canonical: absoluteUrl("/valuation") }
};

export default function ValuationPage() {
  return <PageShell>
    <section className="ml-valuation-shell"><div className="ml-shell"><div><span>Motorcycle valuation</span><h1>Get your motorcycle in front of trusted dealers.</h1><p>Start with your registration and a few details about the bike. MotorGeeks helps route suitable opportunities to approved motorcycle dealers.</p><ValuationCta /></div><aside><Icon name="bike" /><h2>What happens next</h2><ol><li>Tell us about your motorcycle</li><li>Add condition details and photos</li><li>We match suitable dealers</li><li>Connect with a buyer</li></ol></aside></div></section>
  </PageShell>;
}
