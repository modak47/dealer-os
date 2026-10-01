import { PageShell } from "../components/site-shell";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("About MotorGeeks", "Learn how MotorGeeks connects UK motorcycle owners with approved dealers through a secure seller-to-dealer offer platform.", "/about");

export default function AboutPage() {
  return <PageShell>
    <section className="ml-page-hero"><div className="ml-shell"><span>About MotorGeeks</span><h1>A motorcycle-first way to connect sellers with real buyers.</h1><p>MotorGeeks gives owners a simpler route than classified adverts and gives approved dealers useful, motorcycle-specific opportunities.</p></div></section>
    <section className="ml-content-band"><div className="ml-shell ml-two-col"><article><h2>For sellers</h2><p>Submit your motorcycle details once, including condition and photos where available. MotorGeeks can help match the opportunity with suitable motorcycle dealers.</p></article><article><h2>For dealers</h2><p>Approved dealers can review relevant opportunities in the Dealer Portal and contact the customer after a successful claim.</p></article></div></section>
  </PageShell>;
}
