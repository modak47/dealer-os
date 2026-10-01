import { FaqSection } from "../components/sections";
import { PageShell } from "../components/site-shell";
import { pageMetadata } from "../site";

export const metadata = pageMetadata("Selling Your Motorbike: Questions and Answers", "Answers about motorcycle valuations, dealer offers, finance, MOT, photographs, collection and selling through MotorGeeks.", "/faq");

export default function FaqPage() {
  return <PageShell>
    <section className="ml-page-hero compact"><div className="ml-shell"><span>Seller questions</span><h1>Questions about selling with MotorGeeks.</h1><p>Clear answers about valuations, dealer offers and what happens when you choose to proceed.</p></div></section>
    <FaqSection showLink={false} />
  </PageShell>;
}
