import { PageShell } from "./components/site-shell";
import { DealerProofSection, FaqSection, Hero, HowItWorksSection, ImageCta, TrustStrip, WhySection } from "./components/sections";

export default function Home() {
  return <PageShell>
    <Hero />
    <TrustStrip />
    <HowItWorksSection />
    <WhySection />
    <DealerProofSection />
    <ImageCta />
    <FaqSection />
  </PageShell>;
}
