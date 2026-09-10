import type { Metadata } from "next";
import { PageShell } from "../components/site-shell";
import { ContactForm } from "../components/simple-forms";
import { absoluteUrl } from "../site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact MotorGeeks about selling a motorcycle or dealer access.",
  alternates: { canonical: absoluteUrl("/contact") }
};

export default function ContactPage() {
  return <PageShell>
    <section className="ml-page-hero compact"><div className="ml-shell"><span>Contact</span><h1>Talk to MotorGeeks.</h1><p>Send us a message about selling a motorcycle, dealer access or the MotorGeeks platform.</p></div></section>
    <section className="ml-form-section"><div className="ml-shell"><ContactForm kind="contact" /></div></section>
  </PageShell>;
}
