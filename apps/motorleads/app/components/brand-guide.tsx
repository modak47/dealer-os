import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Breadcrumbs } from "./seo";
import { PageShell } from "./site-shell";
import { ValuationCta } from "./valuation-cta";

export type BrandGuideContent = {
  brand: string;
  logo: string;
  heroImage: string;
  path: string;
  breadcrumb: string;
  eyebrow: string;
  h1: string;
  intro: string;
  overviewHeading: string;
  overview: string[];
  familiesIntro: string;
  families: { name: string; detail: string }[];
  evidenceHeading: string;
  evidenceIntro: string;
  evidence: string[];
  conditionHeading: string;
  condition: string[];
  photosHeading: string;
  photos: string[];
  faqs: { question: string; answer: string }[];
};

export function BrandGuide({ guide }: { guide: BrandGuideContent }) {
  return <PageShell>
    <Breadcrumbs items={[
      { name: "Motorcycle brands", path: "/motorcycle-brands" },
      { name: guide.breadcrumb, path: guide.path }
    ]} />
    <section
      className="ml-guide-hero ml-brand-hero"
      style={{ "--ml-brand-image": `url("${guide.heroImage}")` } as CSSProperties}
    >
      <div className="ml-shell">
        <div className="ml-brand-page-logo">
          <Image src={guide.logo} alt={`${guide.brand} logo`} width={156} height={72} priority />
        </div>
        <span>{guide.eyebrow}</span>
        <h1>{guide.h1}</h1>
        <p>{guide.intro}</p>
        <Link className="ml-button ml-button-orange" href="/valuation">Get a valuation <span>→</span></Link>
      </div>
    </section>
    <article className="ml-guide-content">
      <div className="ml-shell ml-guide-grid">
        <div className="ml-guide-main">
          <section>
            <h2>{guide.overviewHeading}</h2>
            {guide.overview.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          </section>
          <section>
            <h2>Tell us your model, version and features</h2>
            <p>The version is the extra part of the model name, such as Sport, GT or RS. If you are unsure, check your registration document or service book and tell us what you know.</p>
            <p>{guide.familiesIntro}</p>
            <div className="ml-brand-families">{guide.families.map(family => <article key={family.name}>
              <h3>{family.name}</h3>
              <p>{family.detail}</p>
            </article>)}</div>
          </section>
          <section>
            <h2>{guide.evidenceHeading}</h2>
            <p>{guide.evidenceIntro}</p>
            <ul className="ml-brand-checklist">{guide.evidence.map(item => <li key={item}>{item}</li>)}</ul>
          </section>
          <section>
            <h2>{guide.conditionHeading}</h2>
            {guide.condition.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          </section>
          <section>
            <h2>{guide.photosHeading}</h2>
            {guide.photos.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          </section>
          <section>
            <h2>How MotorGeeks dealer offers work</h2>
            <p>Enter your registration or add your motorcycle details yourself, then tell us its mileage, condition, service history, features and accessories. Add clear photos so approved dealers can review your bike and decide whether to make an offer. You can compare offers and there is no obligation to accept one.</p>
            <p>If you accept, the selected dealer receives the contact information needed to discuss inspection, payment and collection or handover. The motorcycle must still match its description, and the purchase is completed directly with the dealer. Read the <Link href="/how-to-sell-a-motorbike">UK motorbike selling guide</Link> before handover.</p>
          </section>
          <section>
            <h2>{guide.brand} seller questions</h2>
            <div className="ml-brand-faqs">{guide.faqs.map(faq => <details key={faq.question}>
              <summary>{faq.question}<span aria-hidden="true">+</span></summary>
              <p>{faq.answer}</p>
            </details>)}</div>
          </section>
          <section className="ml-brand-disclaimer">
            <h2>About manufacturer names</h2>
            <p>{guide.brand} names, model names and logos identify the motorcycle being sold. MotorGeeks is an independent marketplace and is not endorsed by, sponsored by or affiliated with {guide.brand}.</p>
          </section>
        </div>
        <aside className="ml-guide-aside">
          <h2>What to have ready</h2>
          <p>Have your model details, current mileage, service and MOT records, keys and clear photos ready. Tell us about any faults, accessories or changes made to your bike.</p>
          <Link className="ml-button ml-button-orange" href="/valuation">Start your valuation <span>→</span></Link>
          <Link href="/motorbike-valuation">What affects a valuation?</Link>
          <Link href="/motorcycle-brands">Browse all brand guides</Link>
        </aside>
      </div>
    </article>
    <section className="ml-brand-registration">
      <div className="ml-shell">
        <div><span>Ready to begin?</span><h2>Enter your registration.</h2><p>Tell us about your {guide.brand} and let approved dealers make you an offer.</p></div>
        <ValuationCta compact />
      </div>
    </section>
  </PageShell>;
}
