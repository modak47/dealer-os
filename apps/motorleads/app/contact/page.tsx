import { PageShell } from "../components/site-shell";
import { ContactForm } from "../components/simple-forms";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Contact MotorGeeks", "Contact MotorGeeks about selling a motorcycle, your secure seller profile or access to the dealer network.", "/contact");

export default function ContactPage() {
  return <PageShell>
    <section className="ml-page-hero compact"><div className="ml-shell"><span>Contact</span><h1>Talk to MotorGeeks.</h1><p>Send us a message about selling a motorcycle, dealer access or the MotorGeeks platform.</p></div></section>
    <section className="ml-form-section"><div className="ml-shell"><ContactForm kind="contact" /></div></section>
  </PageShell>;
}
