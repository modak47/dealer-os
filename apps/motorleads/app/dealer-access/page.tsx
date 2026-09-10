import type { Metadata } from "next";
import { PageShell } from "../components/site-shell";
import { ContactForm } from "../components/simple-forms";
import { absoluteUrl } from "../site";

export const metadata: Metadata = {
  title: "Dealer Access",
  description: "Request access to MotorGeeks motorcycle seller opportunities.",
  alternates: { canonical: absoluteUrl("/dealer-access") }
};

export default function DealerAccessPage() {
  return <PageShell>
    <section className="ml-page-hero dealer-access"><div className="ml-shell"><span>Dealer Access</span><h1>Request access to motorcycle seller opportunities.</h1><p>Tell us about your dealership. We review each application before MotorGeeks Dealer Portal access is enabled.</p></div></section>
    <section className="ml-form-section"><div className="ml-shell"><ContactForm kind="dealer-access" /></div></section>
  </PageShell>;
}
