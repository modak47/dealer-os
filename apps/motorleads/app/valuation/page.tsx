import Link from "next/link";
import { Breadcrumbs } from "../components/seo";
import { PageShell } from "../components/site-shell";
import { pageMetadata } from "../site";
import { ValuationFlow } from "./valuation-flow";

export const metadata = pageMetadata("Free Motorbike Valuation and Dealer Offers", "Enter your motorcycle registration, add condition and history details and invite approved dealers to make offers through MotorGeeks.", "/valuation");

export default async function ValuationPage({ searchParams }: { searchParams: Promise<{ registration?: string }> }) {
  const params = await searchParams;
  return <PageShell>
    <Breadcrumbs items={[{ name: "Motorbike valuation", path: "/valuation" }]} />
    <ValuationFlow initialRegistration={params.registration ?? ""} />
    <section className="ml-valuation-context"><div className="ml-shell">
      <div><span>Understanding your valuation</span><h2>What helps dealers assess your motorcycle?</h2><p>A registration lookup can identify useful vehicle information, but condition, mileage, service history, MOT status and current demand also affect what a dealer may offer. Add accurate details and show faults plainly.</p></div>
      <div><h3>Clear photos reduce uncertainty</h3><p>Photographs of both sides, the front, rear, dashboard, records and any damage help dealers understand the motorcycle before making an offer.</p><h3>An offer is not a guaranteed purchase</h3><p>You do not have to accept an offer. If you proceed, the dealer will confirm the motorcycle and arrange payment and handover directly with you.</p><p><Link href="/motorbike-valuation">Read the motorbike valuation guide</Link> or see <Link href="/how-to-sell-a-motorbike">how to prepare for a sale</Link>.</p></div>
    </div></section>
  </PageShell>;
}
