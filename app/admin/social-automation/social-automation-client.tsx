"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CSSProperties, SyntheticEvent } from "react";
import type { PublicStockBike } from "@/lib/stock";
import type { SocialChannel, SocialPublishingBike, SocialPublishingStatus, SocialQueueItem, SocialStockSetting, SocialTemplate } from "@/lib/social-automation";

type Panel = "stock" | "create" | "status" | "automation" | "templates" | "queue";
type TemplateDesign = {
  layout: "single" | "multi" | "spotlight";
  accent: string;
  background: "light" | "dark";
  badge: string;
  headline: string;
  subline: string;
  showPrice: boolean;
  pricePosition: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "under-title";
  showBrand: boolean;
  showThumbs: boolean;
};

export function SocialAutomationClient({ channels, templates, queue, stock, publishingOverview, stockSettings }: { channels: SocialChannel[]; templates: SocialTemplate[]; queue: SocialQueueItem[]; stock: PublicStockBike[]; publishingOverview: SocialPublishingBike[]; stockSettings: SocialStockSetting[] }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("stock");
  const [bikeId, setBikeId] = useState(stock[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates.find(template => template.active)?.id ?? "");
  const [platform, setPlatform] = useState(channels.find(channel => channel.platform === "pinterest")?.platform ?? channels[0]?.platform ?? "facebook");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCount, setShowCount] = useState(10);
  const [sortMode, setSortMode] = useState("newest");
  const [settings, setSettings] = useState<Record<string, SocialStockSetting>>(() => Object.fromEntries(stockSettings.map(setting => [String(setting.stock_bike_id), setting])));
  const [busy, setBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState<string>("");
  const [message, setMessage] = useState("");
  const activeTemplates = templates.filter(template => template.active);
  const selectedBike = stock.find(bike => bike.id === bikeId);
  const selectedTemplate = templates.find(template => template.id === templateId);
  const selectedChannel = channels.find(channel => channel.platform === platform);
  const displayImages = selectedBike?.imageUrls.filter(image => image && !image.includes("bike-placeholder")).slice(0, 4) ?? [];
  const stockRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = stock.filter(bike => {
      const matchesSearch = !term || `${bike.year} ${bike.make} ${bike.model} ${bike.variant} ${bike.price}`.toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || bike.status.toLowerCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
    return rows.sort((a, b) => sortMode === "price_high" ? b.price - a.price : sortMode === "price_low" ? a.price - b.price : sortMode === "oldest" ? Date.parse(a.createdTime || "0") - Date.parse(b.createdTime || "0") : Date.parse(b.createdTime || "0") - Date.parse(a.createdTime || "0")).slice(0, showCount);
  }, [search, showCount, sortMode, statusFilter, stock]);
  const preview = useMemo(() => {
    if (!selectedBike || !selectedTemplate) return "";
    return selectedTemplate.caption_template
      .replaceAll("{{year}}", String(selectedBike.year || ""))
      .replaceAll("{{make}}", selectedBike.make)
      .replaceAll("{{model}}", selectedBike.model)
      .replaceAll("{{variant}}", selectedBike.variant)
      .replaceAll("{{price}}", money(selectedBike.price))
      .replaceAll("{{mileage}}", selectedBike.mileage)
      .replaceAll("{{url}}", `/used-bikes/${selectedBike.slug}`);
  }, [selectedBike, selectedTemplate]);
  const previewTitle = selectedBike ? `${selectedBike.year || ""} ${selectedBike.make} ${selectedBike.model}`.trim() : "";

  async function queueBikePost(targetBikeId = String(selectedBike?.id ?? bikeId ?? "")) {
    setBusy(true);
    setMessage("");
    try {
      if (!targetBikeId) throw new Error("Choose a bike.");
      if (!templateId) throw new Error("Choose a template.");
      const response = await fetch("/api/crm/social-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock_bike_id: targetBikeId, bike_id: targetBikeId, template_id: templateId, platform }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to queue post.");
      setMessage("Draft post queued for approval.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to queue post.");
    } finally {
      setBusy(false);
    }
  }

  async function updateQueueItem(id: string, status: "approved" | "cancelled") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/crm/social-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to update post.");
      setMessage(status === "approved" ? "Post approved for the Pinterest worker." : "Post cancelled.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update post.");
    } finally {
      setBusy(false);
    }
  }

  async function saveStockSetting(stockBikeId: string, patch: Partial<SocialStockSetting>) {
    const current = settings[stockBikeId];
    const optimistic = {
      id: current?.id ?? `pending-${stockBikeId}`,
      stock_bike_id: Number(stockBikeId),
      include_in_rotation: current?.include_in_rotation ?? true,
      priority: current?.priority ?? false,
      preferred_platform: current?.preferred_platform ?? null,
      preferred_template_id: current?.preferred_template_id ?? null,
      preferred_post_time: current?.preferred_post_time ?? null,
      max_posts_per_bike: current?.max_posts_per_bike ?? 6,
      last_queued_at: current?.last_queued_at ?? null,
      notes: current?.notes ?? null,
      updated_at: new Date().toISOString(),
      ...patch,
    } satisfies SocialStockSetting;
    setSettings(existing => ({ ...existing, [stockBikeId]: optimistic }));
    setSettingsBusy(stockBikeId);
    setMessage("");
    try {
      const response = await fetch("/api/crm/social-stock-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock_bike_id: stockBikeId, ...patch }),
      });
      const result = await response.json() as { setting?: SocialStockSetting; error?: string };
      if (!response.ok || !result.setting) throw new Error(result.error || "Unable to save social stock setting.");
      setSettings(existing => ({ ...existing, [stockBikeId]: result.setting as SocialStockSetting }));
      setMessage("Stock social setting saved.");
    } catch (error) {
      if (current) setSettings(existing => ({ ...existing, [stockBikeId]: current }));
      else setSettings(existing => {
        const next = { ...existing };
        delete next[stockBikeId];
        return next;
      });
      setMessage(error instanceof Error ? error.message : "Unable to save social stock setting.");
    } finally {
      setSettingsBusy("");
    }
  }

  return <div className="social-automation">
    <section className="social-status-grid">
      {channels.map(channel => <article key={channel.id}><span>{platformLabel(channel.platform)}</span><b>{channel.display_name}</b><em className={channel.status}>{channel.status.replaceAll("_", " ")}</em><small>{channel.posting_enabled ? "Posting enabled" : "Manual setup required"}</small></article>)}
    </section>

    <nav className="social-workspace-tabs" aria-label="Social automation sections">
      <button type="button" className={panel === "stock" ? "active" : ""} onClick={() => setPanel("stock")}>Stock Settings</button>
      <button type="button" className={panel === "create" ? "active" : ""} onClick={() => setPanel("create")}>Create Post</button>
      <button type="button" className={panel === "status" ? "active" : ""} onClick={() => setPanel("status")}>Publishing Status</button>
      <button type="button" className={panel === "automation" ? "active" : ""} onClick={() => setPanel("automation")}>Automation Settings</button>
      <button type="button" className={panel === "templates" ? "active" : ""} onClick={() => setPanel("templates")}>Templates</button>
      <button type="button" className={panel === "queue" ? "active" : ""} onClick={() => setPanel("queue")}>Queue</button>
    </nav>

    {message && <p className={message.includes("queued") || message.includes("approved") || message.includes("saved") ? "stock-save-message success" : "stock-save-message"}>{message}</p>}

    {panel === "stock" ? <section className="social-workspace-panel">
      <div className="social-stock-toolbar">
        <label><span>Search vehicle</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search vehicle..." /></label>
        <label><span>Show</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All</option><option value="in stock">In stock</option><option value="reserved">Reserved</option></select></label>
        <label><span>Rows</span><select value={showCount} onChange={event => setShowCount(Number(event.target.value))}><option value={10}>10 vehicles</option><option value={25}>25 vehicles</option><option value={50}>50 vehicles</option></select></label>
        <label><span>Sort</span><select value={sortMode} onChange={event => setSortMode(event.target.value)}><option value="newest">Newest stock first</option><option value="oldest">Oldest stock first</option><option value="price_high">Price high to low</option><option value="price_low">Price low to high</option></select></label>
      </div>
      <div className="social-automation-filter">
        <b>Posting defaults</b>
        <label><span>Template</span><select value={templateId} onChange={event => setTemplateId(event.target.value)}>{activeTemplates.map(template => <option value={template.id} key={template.id}>{template.name}</option>)}</select></label>
        <label><span>Platform</span><select value={platform} onChange={event => setPlatform(event.target.value)}>{channels.map(channel => <option value={channel.platform} key={channel.id}>{platformLabel(channel.platform)}</option>)}</select></label>
      </div>
      <div className="social-stock-settings-table">
        <div className="social-stock-settings-row head"><span>ID</span><span>Vehicle</span><span>Price</span><span>Last post</span><span>Random list</span><span>Actions</span></div>
        {stockRows.map((bike, index) => {
          const platformStatus = getPlatformStatus(publishingOverview, bike.id, platform);
          const setting = settings[bike.id];
          const included = setting?.include_in_rotation !== false;
          const priority = setting?.priority === true;
          return <div className="social-stock-settings-row" key={bike.id}>
            <span>{bike.id}</span>
            <div className="social-stock-settings-bike"><img src={bike.image} alt={`${bike.make} ${bike.model}`} onError={fallbackImage} /><b>{bike.year} {bike.make} {bike.model}</b><small>{bike.variant || bike.mileage}</small></div>
            <span>{money(bike.price)}</span>
            <span className={platformStatus.status === "posted" ? "ok" : ""}>{platformStatus.lastUpdated ? new Date(platformStatus.lastUpdated).toLocaleString("en-GB") : platformStatus.label}</span>
            <span className={included ? "ok" : ""}>{priority ? "Priority" : included ? (index % 2 === 0 ? "Included" : "Rotation") : "Excluded"}</span>
            <div className="social-stock-actions">
              <button type="button" onClick={() => void saveStockSetting(bike.id, { include_in_rotation: true, priority: true, preferred_platform: platform, preferred_template_id: templateId })} disabled={settingsBusy === bike.id}>{priority ? "Priority On" : "Add Priority"}</button>
              <button type="button" onClick={() => { setBikeId(bike.id); setPanel("create"); }}>Create</button>
              <button type="button" onClick={() => void saveStockSetting(bike.id, included ? { include_in_rotation: false, priority: false } : { include_in_rotation: true })} disabled={settingsBusy === bike.id}>{included ? "Exclude" : "Include"}</button>
            </div>
          </div>;
        })}
      </div>
    </section> : null}

    {panel === "create" ? <section className="social-compose-panel">
      <div>
        <h2>Create Draft Post</h2>
        <p>Choose the bike, template and platform, preview the creative, then queue it for approval.</p>
      </div>
      <div className="social-compose-form">
        <label><span>Bike</span><select value={bikeId} onChange={event => setBikeId(event.target.value)}>{stock.map(bike => <option value={bike.id} key={bike.id}>{bike.year} {bike.make} {bike.model} - {money(bike.price)}</option>)}</select></label>
        <label><span>Template</span><select value={templateId} onChange={event => setTemplateId(event.target.value)}>{activeTemplates.map(template => <option value={template.id} key={template.id}>{template.name}</option>)}</select></label>
        <label><span>Platform</span><select value={platform} onChange={event => setPlatform(event.target.value)}>{channels.map(channel => <option value={channel.platform} key={channel.id}>{platformLabel(channel.platform)}</option>)}</select></label>
        <button type="button" onClick={() => void queueBikePost()} disabled={busy || !bikeId || !templateId}>{busy ? "Queueing..." : "Queue Draft"}</button>
      </div>
      {selectedBike ? <div className={`social-creative-preview ${platform}`}>
        <div className="social-preview-art">
          <div className="social-preview-main"><img src={displayImages[0] || selectedBike.image} alt={previewTitle} onError={fallbackImage} /><strong>{money(selectedBike.price)}</strong></div>
          <div className="social-preview-ribbon"><b>YES MOTO</b><span>Delivery - Part exchange - Finance</span></div>
          <div className="social-preview-thumbs">{(displayImages.length ? displayImages : [selectedBike.image]).slice(0, 3).map((image, index) => <img src={image} alt={`${previewTitle} preview ${index + 1}`} onError={fallbackImage} key={`${image}-${index}`} />)}</div>
          <div className="social-preview-footer"><b>{previewTitle}</b><span>{selectedBike.variant || selectedBike.mileage}</span></div>
        </div>
        <div className="social-preview-copy"><small>{platformLabel(platform)} draft preview</small><h3>{selectedChannel?.posting_enabled ? "Ready to publish after approval" : "Connection needed before publishing"}</h3><p>{preview || "Choose a bike and template to preview the caption."}</p><a href={`/used-bikes/${selectedBike.slug}`} target="_blank" rel="noreferrer">View website advert</a></div>
      </div> : <div className="social-preview-empty">Choose a bike and template to preview the post.</div>}
    </section> : null}

    {panel === "status" ? <PublishingStatus channels={channels} publishingOverview={publishingOverview} /> : null}
    {panel === "automation" ? <AutomationSettings channels={channels} /> : null}
    {panel === "templates" ? <TemplateGrid templates={templates} bike={selectedBike ?? stock[0]} selectTemplate={(id) => { setTemplateId(id); setPanel("create"); }} /> : null}
    {panel === "queue" ? <QueuePanel queue={queue} busy={busy} updateQueueItem={updateQueueItem} /> : null}
  </div>;
}

function PublishingStatus({ channels, publishingOverview }: { channels: SocialChannel[]; publishingOverview: SocialPublishingBike[] }) {
  return <section className="social-publishing-panel">
    <div className="panel-title"><h2>Publishing Status</h2><span>{publishingOverview.length} bikes</span></div>
    <div className="social-publishing-table">
      <div className="social-publishing-row social-publishing-head"><span>Bike</span><span>Website</span>{channels.map(channel => <span key={channel.id}>{platformLabel(channel.platform)}</span>)}<span>Auto Trader</span></div>
      {publishingOverview.map(bike => <div className="social-publishing-row" key={bike.stockBikeId}>
        <div className="social-publishing-bike"><img src={bike.image} alt={bike.title} onError={fallbackImage} /><div><b>{bike.title}</b><small>{bike.status} - {money(bike.price)}</small></div></div>
        <StatusPill item={bike.website} />
        {bike.channels.map(item => <StatusPill item={item} key={item.platform} />)}
        <StatusPill item={bike.autotrader} />
      </div>)}
    </div>
  </section>;
}

function AutomationSettings({ channels }: { channels: SocialChannel[] }) {
  return <section className="social-workspace-panel">
    <div className="social-automation-settings-grid">
      <article><b>Enable Automation</b><span className="social-toggle on">On</span></article>
      <article><b>Posting Mode</b><span>Manual approval</span></article>
      <article><b>Post Frequency</b><span>Every day</span></article>
      <article><b>Posts Per Day</b><span>2</span></article>
    </div>
    <div className="social-time-strip"><b>Post Times</b><span>09:45 AM</span><span>06:00 PM</span><span>12:00 PM</span><span>12:00 PM</span><span>12:00 PM</span></div>
    <div className="social-channel-settings">{channels.map(channel => <article key={channel.id}><b>{platformLabel(channel.platform)}</b><span>{channel.posting_enabled ? "Ready for approved posts" : "Connection required"}</span></article>)}</div>
  </section>;
}

function TemplateGrid({ templates, bike, selectTemplate }: { templates: SocialTemplate[]; bike?: PublicStockBike; selectTemplate: (id: string) => void }) {
  const [filter, setFilter] = useState("all");
  const [editingTemplate, setEditingTemplate] = useState<SocialTemplate | null>(null);
  const [design, setDesign] = useState<TemplateDesign>(defaultTemplateDesign());
  const filtered = templates.filter(template => filter === "all" || templateType(template) === filter);
  function edit(template: SocialTemplate) {
    setEditingTemplate(template);
    setDesign(defaultTemplateDesign(template, bike));
  }
  return <section className="social-workspace-panel">
    <div className="social-template-toolbar">
      <b>Filter Templates:</b>
      {["all", "single", "multi", "spotlight"].map(option => <button type="button" className={filter === option ? "active" : ""} onClick={() => setFilter(option)} key={option}>{templateFilterLabel(option)}</button>)}
      <button type="button" className="settings" onClick={() => templates[0] && edit(templates[0])}>Create Custom Design</button>
    </div>
    {editingTemplate ? <TemplateDesigner template={editingTemplate} bike={bike} design={design} setDesign={setDesign} close={() => setEditingTemplate(null)} useTemplate={() => selectTemplate(editingTemplate.id)} /> : null}
    <div className="social-template-grid">{filtered.map(template => {
      const type = templateType(template);
      return <article className={`social-template-card ${type}`} key={template.id}>
        <TemplateArtwork template={template} bike={bike} />
        <div className="social-template-meta">
          <span>{template.platform ? platformLabel(template.platform) : "All channels"}</span>
          <b>{template.name}</b>
          <small>{templateFilterLabel(type)}</small>
        </div>
        <p>{renderTemplateSnippet(template.caption_template, bike)}</p>
        <div className="social-template-card-actions"><button type="button" onClick={() => edit(template)}>Edit Design</button><button type="button" onClick={() => selectTemplate(template.id)}>Use Template</button></div>
      </article>;
    })}</div>
  </section>;
}

function TemplateDesigner({ template, bike, design, setDesign, close, useTemplate }: { template: SocialTemplate; bike?: PublicStockBike; design: TemplateDesign; setDesign: (next: TemplateDesign) => void; close: () => void; useTemplate: () => void }) {
  const update = <K extends keyof TemplateDesign>(key: K, value: TemplateDesign[K]) => setDesign({ ...design, [key]: value });
  return <div className="social-template-designer">
    <div className="designer-toolbar">
      <div><span>Design editor</span><b>{template.name}</b></div>
      <button type="button" onClick={close}>Close</button>
    </div>
    <div className="designer-grid">
      <aside className="designer-controls">
        <label><span>Layout</span><select value={design.layout} onChange={event => update("layout", event.target.value as TemplateDesign["layout"])}><option value="single">Single Banner</option><option value="multi">Multiple Image</option><option value="spotlight">Spotlight</option></select></label>
        <label><span>Theme</span><select value={design.background} onChange={event => update("background", event.target.value as TemplateDesign["background"])}><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label><span>Accent</span><input type="color" value={design.accent} onChange={event => update("accent", event.target.value)} /></label>
        <label><span>Badge text</span><input value={design.badge} onChange={event => update("badge", event.target.value)} /></label>
        <label><span>Headline</span><input value={design.headline} onChange={event => update("headline", event.target.value)} /></label>
        <label><span>Subline</span><input value={design.subline} onChange={event => update("subline", event.target.value)} /></label>
        <label><span>Price position</span><select value={design.pricePosition} onChange={event => update("pricePosition", event.target.value as TemplateDesign["pricePosition"])}><option value="top-right">Top right</option><option value="top-left">Top left</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="under-title">Under title</option></select></label>
        <div className="designer-switches">
          <label><input type="checkbox" checked={design.showPrice} onChange={event => update("showPrice", event.target.checked)} />Price</label>
          <label><input type="checkbox" checked={design.showBrand} onChange={event => update("showBrand", event.target.checked)} />Brand</label>
          <label><input type="checkbox" checked={design.showThumbs} onChange={event => update("showThumbs", event.target.checked)} />Thumbnails</label>
        </div>
        <button type="button" onClick={useTemplate}>Use This Design</button>
      </aside>
      <div className="designer-canvas-wrap">
        <TemplateArtwork template={template} bike={bike} design={design} large />
      </div>
    </div>
  </div>;
}

function TemplateArtwork({ template, bike, design, large = false }: { template: SocialTemplate; bike?: PublicStockBike; design?: TemplateDesign; large?: boolean }) {
  const type = design?.layout ?? templateType(template);
  const title = bike ? `${bike.year || ""} ${bike.make} ${bike.model}`.trim() : "Vehicle Year & Make";
  const price = bike ? money(bike.price) : "Price";
  const image = bike?.image || "/bike-placeholder.svg";
  const extraImages = bike?.imageUrls?.filter(item => item && !item.includes("bike-placeholder")).slice(1, 4) ?? [];
  const style = design ? ({ "--template-accent": design.accent } as CSSProperties) : undefined;
  return <div className={`social-template-art ${type} ${large ? "large" : ""} ${design?.background === "dark" ? "dark" : ""}`} style={style}>
    <div className="template-main-image"><img src={image} alt={title} onError={fallbackImage} /></div>
    {design?.showThumbs === false || type === "single" ? null : <div className="template-side-images">
      {(extraImages.length ? extraImages : [image, image, image]).slice(0, type === "spotlight" ? 2 : 3).map((item, index) => <img src={item} alt={`${title} template ${index + 1}`} onError={fallbackImage} key={`${item}-${index}`} />)}
    </div>}
    {design?.showPrice === false ? null : <div className={`template-price price-${design?.pricePosition ?? "under-title"}`}>{price}</div>}
    {design?.showBrand === false ? null : <div className="template-brand">{design?.badge || "YES MOTO"}</div>}
    <div className="template-title"><b>{design?.headline || title}</b><span>{design?.subline || bike?.variant || bike?.mileage || "Vehicle Model"}</span></div>
  </div>;
}

function defaultTemplateDesign(template?: SocialTemplate, bike?: PublicStockBike): TemplateDesign {
  const title = bike ? `${bike.year || ""} ${bike.make} ${bike.model}`.trim() : "Vehicle Year & Make";
  const layout = template ? templateType(template) as TemplateDesign["layout"] : "single";
  return {
    layout,
    accent: "#00e51d",
    background: "light",
    badge: "YES MOTO",
    headline: title,
    subline: bike?.variant || bike?.mileage || "Finance - Delivery - Part exchange",
    showPrice: true,
    pricePosition: "under-title",
    showBrand: true,
    showThumbs: true,
  };
}

function templateType(template: SocialTemplate) {
  const text = `${template.name} ${template.caption_template}`.toLowerCase();
  if (/weekly|still available|multiple|carousel/.test(text)) return "multi";
  if (/low mileage|spotlight|feature/.test(text)) return "spotlight";
  return "single";
}

function templateFilterLabel(value: string) {
  return ({ all: "All", single: "Single Banner", multi: "Multiple Image", spotlight: "Spotlight" } as Record<string, string>)[value] ?? value;
}

function renderTemplateSnippet(template: string, bike?: PublicStockBike) {
  if (!bike) return template;
  return template
    .replaceAll("{{year}}", String(bike.year || ""))
    .replaceAll("{{make}}", bike.make)
    .replaceAll("{{model}}", bike.model)
    .replaceAll("{{variant}}", bike.variant)
    .replaceAll("{{price}}", money(bike.price))
    .replaceAll("{{mileage}}", bike.mileage)
    .replaceAll("{{url}}", `/used-bikes/${bike.slug}`);
}

function QueuePanel({ queue, busy, updateQueueItem }: { queue: SocialQueueItem[]; busy: boolean; updateQueueItem: (id: string, status: "approved" | "cancelled") => Promise<void> }) {
  return <section className="social-workspace-panel">
    <div className="panel-title"><h2>Latest Queue</h2><span>{queue.length} recent</span></div>
    <div className="social-queue-list">{queue.length ? queue.map(item => <article key={item.id}>
      <b>{platformLabel(item.platform)} - {item.status}</b>
      <span>{item.caption}</span>
      {item.error ? <small>{item.error}</small> : null}
      <small>{item.scheduled_for ? new Date(item.scheduled_for).toLocaleString("en-GB") : new Date(item.created_at).toLocaleString("en-GB")}</small>
      <div className="social-queue-actions">
        {["draft", "failed"].includes(item.status) ? <button type="button" onClick={() => void updateQueueItem(item.id, "approved")} disabled={busy}>{item.status === "failed" ? "Retry" : "Approve"}</button> : null}
        {["draft", "approved", "failed"].includes(item.status) ? <button type="button" onClick={() => void updateQueueItem(item.id, "cancelled")} disabled={busy}>Cancel</button> : null}
      </div>
    </article>) : <p>No draft posts queued yet.</p>}</div>
  </section>;
}

function getPlatformStatus(publishingOverview: SocialPublishingBike[], bikeId: string, platform: string) {
  const bike = publishingOverview.find(row => row.stockBikeId === bikeId);
  return bike?.channels.find(item => item.platform === platform) ?? { label: "Not queued", status: "not_started", lastUpdated: null };
}

function platformLabel(value: string) {
  return ({ facebook: "Facebook", instagram: "Instagram", pinterest: "Pinterest", google_business: "Google Business", autotrader: "Auto Trader", website: "Website" } as Record<string, string>)[value] ?? value;
}

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

function fallbackImage(event: SyntheticEvent<HTMLImageElement>) {
  if (event.currentTarget.src.endsWith("/bike-placeholder.svg")) return;
  event.currentTarget.src = "/bike-placeholder.svg";
}

function StatusPill({ item }: { item: SocialPublishingStatus }) {
  const content = <span className={`social-publish-pill ${item.status}`} title={item.error ?? undefined}>
    <b>{item.label}</b>
    {item.lastUpdated ? <small>{new Date(item.lastUpdated).toLocaleDateString("en-GB")}</small> : null}
  </span>;
  if (!item.url) return content;
  return <a className="social-publish-link" href={item.url} target="_blank" rel="noreferrer">{content}</a>;
}
