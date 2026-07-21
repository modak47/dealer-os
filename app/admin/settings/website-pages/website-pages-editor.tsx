"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { WebsitePage, WebsitePageSection } from "@/lib/website-pages";

const emptySection = (): WebsitePageSection => ({ heading: "", body: "", cta_label: "", cta_href: "" });
const newPage = (): WebsitePage => ({
  slug: "new-page",
  path: "/new-page",
  title: "New page",
  nav_label: "New page",
  seo_title: "",
  meta_description: "",
  og_image_url: "",
  canonical_path: "/new-page",
  hero_kicker: "",
  hero_title: "New page",
  hero_subtitle: "",
  body_sections: [emptySection()],
  status: "draft",
  page_kind: "managed",
  show_in_header: false,
  show_in_footer: false,
  display_order: 100,
});

function slugify(value: string) {
  return value.toLowerCase().replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9/-]+/g, "-").replace(/-+/g, "-").replace(/^\/+|\/+$/g, "") || "new-page";
}

export function WebsitePagesEditor({ initialPages, migrationReady }: { initialPages: WebsitePage[]; migrationReady: boolean }) {
  const [pages, setPages] = useState(initialPages);
  const [selectedSlug, setSelectedSlug] = useState(initialPages[0]?.slug ?? "new-page");
  const [draft, setDraft] = useState<WebsitePage>(initialPages[0] ?? newPage());
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const sorted = useMemo(() => [...pages].sort((a, b) => a.display_order - b.display_order || a.title.localeCompare(b.title)), [pages]);

  function select(slug: string) {
    const page = pages.find(item => item.slug === slug);
    if (!page) return;
    setSelectedSlug(slug);
    setDraft({ ...page, body_sections: page.body_sections.length ? page.body_sections : [emptySection()] });
    setMessage("");
  }

  function update<K extends keyof WebsitePage>(key: K, value: WebsitePage[K]) {
    setDraft(current => {
      const next = { ...current, [key]: value };
      if (key === "slug") {
        const slug = slugify(String(value));
        next.slug = slug;
        if (current.path === `/${current.slug}` || !current.path) next.path = `/${slug}`;
        if (current.canonical_path === `/${current.slug}` || !current.canonical_path) next.canonical_path = `/${slug}`;
      }
      return next;
    });
  }

  function updateSection(index: number, value: Partial<WebsitePageSection>) {
    setDraft(current => ({ ...current, body_sections: current.body_sections.map((section, i) => i === index ? { ...section, ...value } : section) }));
  }

  function addPage() {
    const page = newPage();
    setPages(current => current.some(item => item.slug === page.slug) ? current : [page, ...current]);
    setSelectedSlug(page.slug);
    setDraft(page);
    setMessage("New draft page started. Change the slug before saving if needed.");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const cleanSections = draft.body_sections.filter(section => section.heading.trim() || section.body.trim());
      const response = await fetch("/api/website-pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, body_sections: cleanSections }) });
      const result = await response.json() as { page?: WebsitePage; error?: string };
      if (!response.ok || !result.page) throw new Error(result.error || "Unable to save page.");
      const saved = { ...draft, ...result.page, body_sections: cleanSections };
      setPages(current => [saved, ...current.filter(item => item.slug !== selectedSlug && item.slug !== saved.slug)]);
      setSelectedSlug(saved.slug);
      setDraft(saved);
      setMessage("Website page saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save page.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="website-pages-manager">
    <aside>
      <button type="button" className="admin-primary" onClick={addPage}>Create page</button>
      {sorted.map(page => <button type="button" className={page.slug === selectedSlug ? "active" : ""} onClick={() => select(page.slug)} key={page.slug}><b>{page.title}</b><span>{page.path} · {page.page_kind} · {page.status}</span></button>)}
    </aside>
    <section className="website-page-editor">
      <header><div><h2>{draft.title}</h2><p>{draft.page_kind === "builtin" ? "Built-in page: SEO and hero copy can be edited here; layout stays in code." : "Managed page: SEO and page sections are editable here."}</p></div><div><Link href={draft.path || "#"} target="_blank">View page</Link><button className="admin-primary" type="button" onClick={save} disabled={saving || !migrationReady}>{saving ? "Saving..." : "Save page"}</button></div></header>
      {message && <p className={message.includes("saved") ? "stock-save-message success" : "stock-save-message"}>{message}</p>}
      <div className="stock-form-grid">
        <label><span>Title</span><input value={draft.title} onChange={event => update("title", event.target.value)} /></label>
        <label><span>Slug</span><input value={draft.slug} disabled={draft.page_kind === "builtin"} onChange={event => update("slug", event.target.value)} /></label>
        <label><span>Path</span><input value={draft.path} disabled={draft.page_kind === "builtin"} onChange={event => update("path", event.target.value)} /></label>
        <label><span>Status</span><select value={draft.status} onChange={event => update("status", event.target.value as WebsitePage["status"])}><option value="draft">Draft</option><option value="published">Published</option></select></label>
        <label className="full"><span>SEO title</span><input value={draft.seo_title} onChange={event => update("seo_title", event.target.value)} placeholder="Shown in Google and browser tabs" /></label>
        <label className="full"><span>Meta description</span><textarea rows={3} value={draft.meta_description} onChange={event => update("meta_description", event.target.value)} placeholder="Aim for a concise page summary." /></label>
        <label><span>Canonical path</span><input value={draft.canonical_path} onChange={event => update("canonical_path", event.target.value)} /></label>
        <label><span>Social image URL</span><input value={draft.og_image_url} onChange={event => update("og_image_url", event.target.value)} placeholder="https://..." /></label>
        <label><span>Navigation label</span><input value={draft.nav_label} onChange={event => update("nav_label", event.target.value)} /></label>
        <label><span>Display order</span><input type="number" value={draft.display_order} onChange={event => update("display_order", Number(event.target.value))} /></label>
        <label><span>Hero kicker</span><input value={draft.hero_kicker} onChange={event => update("hero_kicker", event.target.value)} /></label>
        <label><span>Hero title</span><input value={draft.hero_title} onChange={event => update("hero_title", event.target.value)} /></label>
        <label className="full"><span>Hero subtitle</span><textarea rows={3} value={draft.hero_subtitle} onChange={event => update("hero_subtitle", event.target.value)} /></label>
        <label className="website-checkbox"><input type="checkbox" checked={draft.show_in_header} onChange={event => update("show_in_header", event.target.checked)} /> Show in header</label>
        <label className="website-checkbox"><input type="checkbox" checked={draft.show_in_footer} onChange={event => update("show_in_footer", event.target.checked)} /> Show in footer</label>
      </div>
      <div className="website-section-editor">
        <div className="panel-title"><h2>Managed page sections</h2><button type="button" onClick={() => update("body_sections", [...draft.body_sections, emptySection()])}>Add section</button></div>
        {draft.body_sections.map((section, index) => <article key={index}>
          <label><span>Heading</span><input value={section.heading} onChange={event => updateSection(index, { heading: event.target.value })} /></label>
          <label><span>Body</span><textarea rows={5} value={section.body} onChange={event => updateSection(index, { body: event.target.value })} /></label>
          <div><label><span>CTA label</span><input value={section.cta_label ?? ""} onChange={event => updateSection(index, { cta_label: event.target.value })} /></label><label><span>CTA link</span><input value={section.cta_href ?? ""} onChange={event => updateSection(index, { cta_href: event.target.value })} /></label></div>
          <button type="button" onClick={() => update("body_sections", draft.body_sections.filter((_, i) => i !== index))}>Remove section</button>
        </article>)}
      </div>
    </section>
  </div>;
}
