import type { Metadata } from "next";
import { FaqSection } from "../components/sections";
import { PageShell } from "../components/site-shell";
import { absoluteUrl } from "../site";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about MotorGeeks.",
  alternates: { canonical: absoluteUrl("/faq") }
};

export default function FaqPage() {
  return <PageShell>
    <section className="ml-page-hero compact"><div className="ml-shell"><span>FAQ</span><h1>Questions about MotorGeeks.</h1></div></section>
    <FaqSection showLink={false} />
  </PageShell>;
}
