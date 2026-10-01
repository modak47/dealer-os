import Link from "next/link";
import { Breadcrumbs } from "../components/seo";
import { PageShell } from "../components/site-shell";
import { pageMetadata } from "../site";

export const metadata = pageMetadata(
  "How to Sell a Motorbike: A Practical UK Guide",
  "A practical UK guide to preparing your motorcycle, documents, finance, photographs, payment, collection and change of keeper.",
  "/how-to-sell-a-motorbike"
);

export default function HowToSellPage() {
  return <PageShell>
    <Breadcrumbs items={[{ name: "How to sell a motorbike", path: "/how-to-sell-a-motorbike" }]} />
    <section className="ml-guide-hero selling-guide"><div className="ml-shell"><span>Seller guide</span><h1>How to sell a motorbike in the UK.</h1><p>Prepare the motorcycle, gather accurate records and understand the handover before you agree a sale.</p><Link className="ml-button ml-button-orange" href="/valuation">Start with your registration <span>→</span></Link></div></section>
    <article className="ml-guide-content"><div className="ml-shell ml-guide-grid">
      <div className="ml-guide-main">
        <section><h2>1. Decide how you want to sell</h2><p>A private sale may give you direct access to individual buyers, but you will normally create the advert, answer enquiries, arrange viewings and manage payment yourself. Selling to a dealer can be simpler because the dealer handles the motorcycle as a trade purchase, although the price may reflect inspection, collection, preparation and resale costs.</p><p>MotorGeeks provides a dealer-offer route. You submit the bike once, approved dealers can consider it, and you decide whether to accept an offer. MotorGeeks is not the buyer.</p></section>
        <section><h2>2. Prepare the motorcycle honestly</h2><p>Clean the bike so its actual condition is visible, but do not conceal faults. Check the current mileage, tyre condition, warning lights and obvious mechanical or cosmetic issues. List modifications and identify any original parts or accessories included with the sale.</p><p>You do not need to carry out uneconomic work simply to submit the bike. Accurate disclosure lets a dealer decide how the condition affects their offer.</p></section>
        <section><h2>3. Gather the documents and keys</h2><p>Find the V5C registration certificate, service book or digital service evidence, maintenance invoices, MOT information, manuals and all available keys. Keep personal information that is not relevant to the sale out of uploaded photographs.</p><p>The V5C is not proof of ownership, but its keeper details are important to the change-of-keeper process. If you are selling for somebody else, explain that clearly and make sure you have authority to do so.</p></section>
        <section><h2>4. Check outstanding finance</h2><p>If the motorcycle has finance outstanding, ask the lender for an up-to-date settlement figure and instructions. Tell the prospective dealer before accepting an offer. The dealer may agree a process for settling the lender and paying any remaining balance, but you should verify the arrangement with both parties.</p><p>Do not describe a financed motorcycle as finance-free. Settlement figures can expire, so obtain a current figure near the transaction date.</p></section>
        <section><h2>5. Take useful photographs</h2><p>Photograph the complete motorcycle from the front, rear and both sides in good daylight. Add the dashboard and mileage, tyres, service history and any accessories. Include close-ups of scratches, dents, corrosion or other damage. A dealer should not have to guess what a carefully angled photograph is hiding.</p><p>MotorGeeks accepts supported JPEG, PNG and WebP images. If an iPhone saves a photograph only as HEIC or HEIF, export or share a compatible JPEG before uploading.</p></section>
        <section><h2>6. Compare and clarify an offer</h2><p>Consider the amount and the practical terms. Ask when the dealer expects to inspect the motorcycle, how payment will be made and who will arrange collection. An offer based on your profile may still depend on the motorcycle matching the description.</p><p>You are not obliged to accept a MotorGeeks offer. If you do accept, keep communicating through appropriate channels and do not ignore changes in the bike&apos;s condition or mileage.</p></section>
        <section><h2>7. Complete payment and handover carefully</h2><p>Agree a secure payment method with the dealer and confirm funds before releasing the motorcycle, documents and keys. Record the agreed condition, mileage and items supplied. If somebody collects on the dealer&apos;s behalf, confirm their identity and authority with the dealer.</p><p>Complete the applicable DVLA change-of-keeper or motor-trade notification using the current official process, and keep confirmation. Tell your insurer after the handover. Requirements can change, so check current GOV.UK and DVLA guidance rather than relying only on a selling guide.</p></section>
        <section><h2>Start with an accurate profile</h2><p>Ready to see whether approved dealers are interested? <Link href="/valuation">Enter your registration and start a valuation</Link>. You can also learn <Link href="/motorbike-valuation">what affects a motorbike valuation</Link> or review <Link href="/faq">common seller questions</Link>.</p></section>
      </div>
      <aside className="ml-guide-aside"><h2>MotorGeeks checklist</h2><ul><li>Registration and mileage</li><li>Keys and keeper details</li><li>Service and MOT history</li><li>Finance settlement details</li><li>Clear condition photos</li><li>Known faults and modifications</li></ul><Link className="ml-button ml-button-orange" href="/valuation">Start your valuation <span>→</span></Link></aside>
    </div></article>
  </PageShell>;
}
