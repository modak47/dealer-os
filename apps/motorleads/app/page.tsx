import { PageShell } from "./components/site-shell";
import { DealerProofSection, FaqSection, Hero, HowItWorksSection, ImageCta, SellerGuidesSection, TrustStrip, WhySection } from "./components/sections";
import { JsonLd } from "./components/seo";
import { absoluteUrl, site } from "./site";

export default function Home() {
  return <PageShell>
    <JsonLd data={[
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${site.url}/#organization`,
        name: site.name,
        url: site.url,
        logo: absoluteUrl(site.assets.mgIcon),
        email: site.contactEmail
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${site.url}/#website`,
        name: site.name,
        url: site.url,
        publisher: { "@id": `${site.url}/#organization` },
        inLanguage: "en-GB"
      }
    ]} />
    <Hero />
    <TrustStrip />
    <HowItWorksSection />
    <WhySection />
    <SellerGuidesSection />
    <DealerProofSection />
    <ImageCta />
    <FaqSection />
  </PageShell>;
}
