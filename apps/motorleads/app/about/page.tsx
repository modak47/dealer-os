import type { Metadata } from "next";
import { PageShell } from "../components/site-shell";
import { absoluteUrl } from "../site";

export const metadata: Metadata = {
  title: "About",
  description: "About MotorGeeks and its motorcycle seller-to-dealer network.",
  alternates: { canonical: absoluteUrl("/about") }
};

export default function AboutPage() {
  return <PageShell>
    <section className="ml-page-hero"><div className="ml-shell"><span>About MotorGeeks</span><h1>A motorcycle-first way to connect sellers with real buyers.</h1><p>MotorGeeks is being built for owners who want a simpler route than classifieds and for dealers who want genuine, useful motorcycle opportunities.</p></div></section>
    <section className="ml-content-band"><div className="ml-shell ml-two-col"><article><h2>For sellers</h2><p>Submit your motorcycle details once, including condition and photos where available. MotorGeeks can help match the opportunity with suitable motorcycle dealers.</p></article><article><h2>For dealers</h2><p>Approved dealers can review relevant opportunities in the Dealer Portal and contact the customer after a successful claim.</p></article></div></section>
  </PageShell>;
}
