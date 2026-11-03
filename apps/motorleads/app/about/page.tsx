import Link from "next/link";
import { PageShell } from "../components/site-shell";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("About MotorGeeks", "Meet MotorGeeks: helping UK motorcycle owners describe their bike, compare offers from approved dealers and choose whether to sell.", "/about");

export default function AboutPage() {
  return <PageShell>
    <section className="ml-page-hero"><div className="ml-shell"><span>About MotorGeeks</span><h1>Helping you sell your motorbike with confidence.</h1><p>Tell us about your bike once and let approved motorcycle dealers make offers. You choose whether to accept, with no obligation to sell.</p></div></section>
    <section className="ml-content-band"><div className="ml-shell ml-two-col"><article><h2>For sellers</h2><p>Enter your registration, check your bike details and add its mileage, service history, condition and photos. We review the details before showing your bike to suitable approved dealers.</p><p>You can compare any offers in your secure motorcycle profile. Dealers cannot see each other’s offers. Your contact details are shared with the dealer whose offer you accept, so you can arrange the final checks, payment and collection.</p><p>MotorGeeks connects you with dealers. We do not buy your bike or guarantee a price or a sale. The purchase is agreed directly between you and the dealer.</p><p><Link href="/how-it-works">See how it works</Link> or <Link href="/valuation">start your free valuation</Link>.</p></article><article><h2>For dealers</h2><p>Approved dealers use the Dealer Portal to review bikes that suit their buying preferences, including the seller’s description and photos where supplied.</p><p>For bikes listed for offers, dealers send their offer through the portal. The seller chooses whether to accept. The chosen dealer can then contact the seller to confirm the bike’s condition and arrange the purchase.</p><p>Dealer applications are reviewed before access is approved. <Link href="/for-dealers">Learn about the dealer network</Link> or <Link href="/dealer-access">apply for dealer access</Link>.</p></article></div></section>
  </PageShell>;
}
