import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../components/icons";
import { PageShell } from "../components/site-shell";
import { absoluteUrl, site } from "../site";

export const metadata: Metadata = {
  title: "For Dealers",
  description: "Motorcycle lead opportunities for approved motorcycle dealers.",
  alternates: { canonical: absoluteUrl("/for-dealers") }
};

const points = [
  "Seller-submitted motorcycle opportunities",
  "Photos and details where supplied",
  "MOT and vehicle information where available",
  "Matched to dealer buying preferences",
  "Review and claim in the Dealer Portal",
  "Customer details unlock after successful claim",
  "Successful Purchase Fee only after purchase"
];

export default function ForDealersPage() {
  return <PageShell>
    <section className="ml-dealer-hero">
      <div className="ml-shell"><div><span>For motorcycle dealers</span><h1>Quality motorcycle opportunities from genuine sellers.</h1><p>Join a focused motorcycle network built to send relevant seller opportunities into the Dealer Portal.</p><div><Link className="ml-button ml-button-orange" href="/dealer-access">Request dealer access <span>→</span></Link><a className="ml-button ml-button-ghost" href={site.dealerLoginUrl}>Dealer Login</a></div></div></div>
    </section>
    <section className="ml-dealer-points"><div className="ml-shell">{points.map(point => <article key={point}><Icon name="shield" /><span>{point}</span></article>)}</div></section>
    <section className="ml-dealer-detail"><div className="ml-shell"><div><span>Dealer network</span><h2>Built for motorcycle dealers.</h2><p>Review relevant opportunities, claim the motorcycles that fit your buying profile and manage each opportunity through one simple portal.</p></div><div><h3>Commercial model</h3><p>Claiming and contacting are free. The dealer-specific Successful Purchase Fee applies only when a motorcycle is purchased.</p></div></div></section>
  </PageShell>;
}
