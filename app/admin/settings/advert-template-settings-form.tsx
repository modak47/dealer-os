"use client";

import { useRef, useState } from "react";
import type { AdvertTemplate, PlaceholderImage } from "@/lib/advert-template-settings";
import { ADVERT_TEMPLATE_PLACEHOLDERS } from "@/lib/advert-template-placeholders";
import { renderAdvertTemplate, validateAdvertTemplateSyntax } from "@/lib/render-advert-template";

const sampleBike = {
  year: 2008,
  make: "Yamaha",
  model: "XMAX 250",
  variant: "",
  registration: "AB08 CDE",
  mileage: 2387,
  price: 2389,
  colour: "Silver",
  engine_cc: 250,
  previous_owners: 2,
  mot_months: 12,
  warranty_months: 3,
  service_history: "Service history present",
  body_style: "Scooter",
  dealer_name: "YesMoto",
  phone: "01273 123456",
  reservation_amount: 99,
};

export function AdvertTemplateSettingsForm({ initialTemplates, initialImages, migrationReady }: { initialTemplates: AdvertTemplate[]; initialImages: PlaceholderImage[]; migrationReady: boolean }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [images, setImages] = useState(initialImages);
  const [newUrl, setNewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const update = (index: number, values: Partial<AdvertTemplate>) => setTemplates(rows => rows.map((row, i) => i === index ? { ...row, ...values } : row));
  const updateImage = (index: number, values: Partial<PlaceholderImage>) => setImages(rows => rows.map((row, i) => i === index ? { ...row, ...values } : row));

  function insertToken(index: number, token: string) {
    const template = templates[index];
    const area = textareas.current[template.section_key];
    const start = area?.selectionStart ?? template.default_text.length;
    const end = area?.selectionEnd ?? start;
    update(index, { default_text: `${template.default_text.slice(0, start)}${token}${template.default_text.slice(end)}` });
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function addImage() {
    const image_url = newUrl.trim();
    if (!image_url) return;
    try { new URL(image_url); } catch { setError("Enter a valid placeholder image URL."); return; }
    setImages(rows => [...rows, { id: `new-${Date.now()}`, image_url, enabled: true, display_order: (rows.length + 1) * 10 }]);
    setNewUrl("");
  }

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    setWarnings([]);
    const localWarnings: string[] = [];
    for (const template of templates) {
      const validation = validateAdvertTemplateSyntax(template.default_text);
      if (validation.malformedTokens.length) {
        setError(`Malformed placeholders in ${template.title}: ${validation.malformedTokens.join(", ")}`);
        setBusy(false);
        return;
      }
      if (validation.unknownTokens.length) localWarnings.push(`${template.title}: ${validation.unknownTokens.join(", ")}`);
    }
    const response = await fetch("/api/crm/settings/advert-templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templates, placeholderImages: images }) });
    const body = await response.json();
    if (response.ok) {
      setTemplates(body.templates);
      setImages(body.placeholderImages);
      setWarnings([...(body.warnings ?? []), ...localWarnings]);
      setMessage("Advert template settings saved.");
    } else {
      setError(body.error || "Unable to save advert templates.");
    }
    setBusy(false);
  }

  return <section className="advert-template-settings">
    <header><div><p>STOCK ADVERT DEFAULTS</p><h2>Advert Template Settings</h2><span>Enabled blocks prefill new stock adverts. Each motorcycle keeps its own editable copy.</span></div><button className="admin-primary" type="button" onClick={save} disabled={busy || !migrationReady}>{busy ? "Saving..." : "Save advert defaults"}</button></header>
    {!migrationReady && <div className="crm-setup"><b>Advert template migration required</b><span>Run 20260708000200_advert_template_settings.sql and the latest personalised advert template migration in Supabase.</span></div>}
    <div className="advert-token-bank"><h3>Available placeholders</h3><div>{ADVERT_TEMPLATE_PLACEHOLDERS.map(placeholder => <button type="button" key={placeholder.key} title={`${placeholder.label}: ${placeholder.example}`} onClick={() => navigator.clipboard?.writeText(placeholder.token)}>{placeholder.token}</button>)}</div><p>Tip: use the token buttons inside each section to insert at the cursor.</p></div>
    <div className="advert-template-list">{templates.map((template, index) => {
      const preview = renderAdvertTemplate(template.default_text, sampleBike, { unresolvedMode: "keep" });
      const validation = validateAdvertTemplateSyntax(template.default_text);
      return <article key={template.section_key}>
        <div className="advert-template-head"><label><span>Enabled by default</span><input type="checkbox" checked={template.enabled_by_default} onChange={event => update(index, { enabled_by_default: event.target.checked })} /></label><label><span>Editable per bike</span><input type="checkbox" checked={template.editable_per_bike} onChange={event => update(index, { editable_per_bike: event.target.checked })} /></label><label><span>Display order</span><input type="number" value={template.display_order} onChange={event => update(index, { display_order: Number(event.target.value) })} /></label></div>
        <label><span>Section title</span><input value={template.title} onChange={event => update(index, { title: event.target.value })} /></label>
        <label><span>Default text template</span><textarea ref={node => { textareas.current[template.section_key] = node; }} rows={7} value={template.default_text} onChange={event => update(index, { default_text: event.target.value })} /></label>
        <div className="advert-token-row">{ADVERT_TEMPLATE_PLACEHOLDERS.map(placeholder => <button type="button" key={placeholder.key} onClick={() => insertToken(index, placeholder.token)}>{placeholder.token}</button>)}</div>
        <div className="advert-template-preview"><span>Preview</span><h3>{template.title}</h3>{formatPreview(preview.text).map((line, lineIndex) => line.bullet ? <p className="bullet" key={lineIndex}>{line.text}</p> : <p key={lineIndex}>{line.text}</p>)}{preview.unresolvedTokens.length > 0 && <small>Unresolved: {preview.unresolvedTokens.join(", ")}</small>}{validation.unknownTokens.length > 0 && <small>Unknown placeholders: {validation.unknownTokens.join(", ")}</small>}</div>
      </article>;
    })}</div>
    <div className="placeholder-settings"><h2>Default Placeholder Images</h2><p>Applied only when a new bike has no images. Real Dealer5/CD5 images override these automatically.</p><div className="placeholder-adder"><input value={newUrl} onChange={event => setNewUrl(event.target.value)} placeholder="https://... placeholder image" /><button type="button" onClick={addImage}>Add image URL</button></div><div className="placeholder-list">{images.map((image, index) => <article key={image.id}><img src={image.image_url} alt="Default stock placeholder" /><input value={image.image_url} onChange={event => updateImage(index, { image_url: event.target.value })} /><label><input type="checkbox" checked={image.enabled} onChange={event => updateImage(index, { enabled: event.target.checked })} /> Enabled</label><input aria-label="Display order" type="number" value={image.display_order} onChange={event => updateImage(index, { display_order: Number(event.target.value) })} /><button type="button" onClick={() => setImages(rows => rows.filter((_, i) => i !== index))}>Remove</button></article>)}</div></div>
    {message && <p className="invoice-success">{message}</p>}
    {warnings.length > 0 && <p className="stock-booking-message">Saved with warnings: {warnings.join(" | ")}</p>}
    {error && <p className="invoice-error">{error}</p>}
  </section>;
}

function formatPreview(text: string) {
  return text.split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => {
    const bullet = /^[-*✓✔•]\s*/.test(line);
    return { bullet, text: bullet ? line.replace(/^[-*✓✔•]\s*/, "") : line };
  });
}
