import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getWebsitePageBySlug, metadataFromWebsitePage } from "@/lib/website-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { page } = await getWebsitePageBySlug(slug);
  if (!page || page.page_kind !== "managed") return {};
  return metadataFromWebsitePage(page, { title: page.title, description: page.meta_description, path: page.path });
}

export default async function ManagedWebsitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { page } = await getWebsitePageBySlug(slug);
  if (!page || page.page_kind !== "managed" || page.status !== "published") notFound();
  return <main>
    <section className="page-hero managed-page-hero"><div className="wide"><p className="kicker">{page.hero_kicker || page.nav_label}</p><h1>{page.hero_title || page.title}</h1>{page.hero_subtitle && <p>{page.hero_subtitle}</p>}</div></section>
    <section className="content wide managed-page-content">
      {page.body_sections.map((section, index) => <article key={`${section.heading}-${index}`}>
        {section.heading && <h2>{section.heading}</h2>}
        {section.body.split(/\n{2,}/).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
        {section.cta_label && section.cta_href && <Link href={section.cta_href}>{section.cta_label}</Link>}
      </article>)}
      {!page.body_sections.length && <article><h2>{page.title}</h2><p>This page is published, but it does not have any content sections yet.</p></article>}
    </section>
  </main>;
}
