import Link from "next/link";
import { Breadcrumbs } from "../components/seo";
import { PageShell } from "../components/site-shell";
import { pageMetadata } from "../site";

export const metadata = pageMetadata(
  "Sell My Motorbike Through Trusted Dealers",
  "Sell your motorbike online through MotorGeeks. Add the bike's details and photos, receive dealer offers and decide whether one works for you.",
  "/sell-my-motorbike"
);

export default function SellMyMotorbikePage() {
  return <PageShell>
    <Breadcrumbs items={[{ name: "Sell my motorbike", path: "/sell-my-motorbike" }]} />
    <section className="ml-guide-hero"><div className="ml-shell"><span>Sell your motorcycle</span><h1>Sell your motorbike through trusted dealers.</h1><p>MotorGeeks gives UK motorcycle owners one place to describe their bike, add useful evidence and consider offers from approved dealers.</p><Link className="ml-button ml-button-orange" href="/valuation">Get a motorcycle valuation <span>→</span></Link></div></section>
    <article className="ml-guide-content">
      <div className="ml-shell ml-guide-grid">
        <div className="ml-guide-main">
          <section><h2>A straightforward alternative to advertising privately</h2><p>Private adverts can mean writing listings, responding to repeated questions and arranging viewings with people you do not know. MotorGeeks is designed around a different route: provide accurate motorcycle information once, then allow suitable motorcycle dealers to review the opportunity and make offers.</p><p>MotorGeeks does not buy the motorcycle and does not guarantee a sale or a particular price. If you accept an offer, the purchase is agreed and completed directly with the dealer, subject to the dealer confirming the motorcycle is as described.</p></section>
          <section><h2>How selling with MotorGeeks works</h2><ol><li><strong>Enter the registration.</strong> Where vehicle data is available, we use it to help identify the motorcycle. You can correct the details or enter them manually.</li><li><strong>Describe the bike honestly.</strong> Add mileage, condition, ownership, keys, service history, MOT information, faults and useful extras.</li><li><strong>Add clear photographs.</strong> Dealers need to see the motorcycle and any damage before deciding what they may be willing to pay.</li><li><strong>Receive and compare offers.</strong> Approved dealers can submit offers without seeing competing amounts. You remain free to decline them.</li><li><strong>Complete the sale with the dealer.</strong> After you accept, the dealer can contact you to confirm the motorcycle, payment and collection or handover.</li></ol></section>
          <section><h2>What information should I provide?</h2><p>Accuracy matters more than sales language. State the current mileage, whether you are the registered keeper, how many keys are present and whether there is outstanding finance. Include the service history you actually have, not the history you expected to receive with the bike.</p><p>Describe scratches, dents, warning lights, mechanical faults, modifications and previous insurance damage where known. An honest profile helps dealers make more meaningful offers and reduces the risk of an offer changing after inspection.</p></section>
          <section><h2>What makes a useful dealer offer?</h2><p>A dealer may consider the motorcycle&apos;s model, age, mileage, condition, specification, maintenance history and current market demand. The highest number is not the only practical consideration: you may also want to clarify how and when the dealer will inspect, pay for and collect the bike.</p><p>An offer shown in MotorGeeks is not a guaranteed completed purchase. The final transaction depends on the motorcycle matching its description and you and the dealer agreeing the handover details.</p></section>
          <section><h2>Before you accept</h2><p>Check that your description remains accurate and tell the dealer about any change. If finance is outstanding, contact the lender for a current settlement figure and discuss the process with the dealer. Never hand over the motorcycle, keys or documents until you are satisfied that the agreed payment has been received through a method you trust.</p><p>For a fuller preparation checklist, read our <Link href="/how-to-sell-a-motorbike">guide to selling a motorbike</Link>. To understand what can influence price, see the <Link href="/motorbike-valuation">motorbike valuation guide</Link>, or browse advice for <Link href="/motorcycle-brands">specific motorcycle brands</Link>.</p></section>
        </div>
        <aside className="ml-guide-aside"><h2>Ready to begin?</h2><p>Enter your registration and build an accurate motorcycle profile. There is no obligation to accept an offer.</p><Link className="ml-button ml-button-orange" href="/valuation">Start your valuation <span>→</span></Link><Link href="/how-it-works">See how MotorGeeks works</Link></aside>
      </div>
    </article>
  </PageShell>;
}
