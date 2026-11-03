import Link from "next/link";
import { Icon } from "../components/icons";
import { PageShell } from "../components/site-shell";
import { pageMetadata, site } from "../site";

export const metadata = pageMetadata("Buy Motorbikes from Private Sellers | Dealer Network", "Join the MotorGeeks dealer network to review motorbikes from UK private sellers, make offers and manage purchases through the Dealer Portal.", "/for-dealers");

const points = [
  "Bikes submitted directly by their owners",
  "Photos and details where supplied",
  "MOT and vehicle information where available",
  "Matched to dealer buying preferences",
  "Review bikes and make offers in the Dealer Portal",
  "Contact the seller after a claim or accepted offer",
  "Successful Purchase Fee only after purchase"
];

export default function ForDealersPage() {
  return <PageShell>
    <section className="ml-dealer-hero">
      <div className="ml-shell"><div><span>For motorcycle dealers</span><h1>Find motorbikes from genuine private sellers.</h1><p>Review bikes that suit your business, see the details and photos supplied by sellers, and manage your purchases in the Dealer Portal.</p><div><Link className="ml-button ml-button-orange" href="/dealer-access">Request dealer access <span>→</span></Link><a className="ml-button ml-button-ghost" href={site.dealerLoginUrl}>Dealer Login</a></div></div></div>
    </section>
    <section className="ml-dealer-points"><div className="ml-shell">{points.map(point => <article key={point}><Icon name="shield" /><span>{point}</span></article>)}</div></section>
    <section className="ml-dealer-detail"><div className="ml-shell"><div><span>Dealer network</span><h2>Built for motorcycle dealers.</h2><p>Some bikes are available to claim directly. For bikes listed for offers, send your offer through the portal and wait for the seller to accept. Contact details become available after a direct claim or after your offer is accepted.</p></div><div><h3>When do I pay?</h3><p>There is no fee to claim a bike or contact a seller. Your agreed Successful Purchase Fee is charged only if you buy the motorcycle.</p></div></div></section>
  </PageShell>;
}
