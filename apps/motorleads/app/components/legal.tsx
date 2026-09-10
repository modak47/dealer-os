import { PageShell } from "./site-shell";

type LegalSection = {
  title: string;
  body: string[];
};

export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return <PageShell>
    <section className="ml-page-hero compact"><div className="ml-shell"><span>Draft for review</span><h1>{title}</h1><p>{intro}</p></div></section>
    <section className="ml-content-band"><div className="ml-shell"><article className="ml-legal-card">{sections.map(section => <div key={section.title}><h2>{section.title}</h2>{section.body.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>)}</article></div></section>
  </PageShell>;
}
