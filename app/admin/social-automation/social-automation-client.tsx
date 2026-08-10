"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import type { PublicStockBike } from "@/lib/stock";
import type { SocialChannel, SocialPublishingBike, SocialPublishingStatus, SocialQueueItem, SocialTemplate } from "@/lib/social-automation";

type Panel = "stock" | "create" | "status" | "automation" | "templates" | "queue";

export function SocialAutomationClient({ channels, templates, queue, stock, publishingOverview }: { channels: SocialChannel[]; templates: SocialTemplate[]; queue: SocialQueueItem[]; stock: PublicStockBike[]; publishingOverview: SocialPublishingBike[] }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("stock");
  const [bikeId, setBikeId] = useState(stock[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates.find(template => template.active)?.id ?? "");
  const [platform, setPlatform] = useState(channels.find(channel => channel.platform === "pinterest")?.platform ?? channels[0]?.platform ?? "facebook");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCount, setShowCount] = useState(10);
  const [sortMode, setSortMode] = useState("newest");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
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
      return matchesSearch && matchesStatus && !excluded.has(bike.id);
    });
    return rows.sort((a, b) => sortMode === "price_high" ? b.price - a.price : sortMode === "price_low" ? a.price - b.price : sortMode === "oldest" ? Date.parse(a.createdTime || "0") - Date.parse(b.createdTime || "0") : Date.parse(b.createdTime || "0") - Date.parse(a.createdTime || "0")).slice(0, showCount);
  }, [excluded, search, showCount, sortMode, statusFilter, stock]);
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

    {message && <p className={message.includes("queued") || message.includes("approved") ? "stock-save-message success" : "stock-save-message"}>{message}</p>}

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
          return <div className="social-stock-settings-row" key={bike.id}>
            <span>{bike.id}</span>
            <div className="social-stock-settings-bike"><img src={bike.image} alt={`${bike.make} ${bike.model}`} onError={fallbackImage} /><b>{bike.year} {bike.make} {bike.model}</b><small>{bike.variant || bike.mileage}</small></div>
            <span>{money(bike.price)}</span>
            <span className={platformStatus.status === "posted" ? "ok" : ""}>{platformStatus.lastUpdated ? new Date(platformStatus.lastUpdated).toLocaleString("en-GB") : platformStatus.label}</span>
            <span>{index % 2 === 0 ? "Included" : "Rotation"}</span>
            <div className="social-stock-actions">
              <button type="button" onClick={() => { setBikeId(bike.id); void queueBikePost(bike.id); }} disabled={busy}>Add Priority</button>
              <button type="button" onClick={() => { setBikeId(bike.id); setPanel("create"); }}>Create</button>
              <button type="button" onClick={() => setExcluded(current => new Set(current).add(bike.id))}>Exclude</button>
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
    {panel === "templates" ? <TemplateGrid templates={templates} selectTemplate={(id) => { setTemplateId(id); setPanel("create"); }} /> : null}
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

function TemplateGrid({ templates, selectTemplate }: { templates: SocialTemplate[]; selectTemplate: (id: string) => void }) {
  return <section className="social-workspace-panel">
    <div className="social-template-toolbar"><b>Filter Templates:</b><span>All</span><span>Single Banner</span><span>Multiple Image</span><span>Carousel</span><button type="button">Text & Hashtags Settings</button></div>
    <div className="social-template-grid">{templates.map(template => <article key={template.id}><div><span>{template.name}</span><strong>{template.platform ? platformLabel(template.platform) : "All channels"}</strong></div><p>{template.caption_template}</p><button type="button" onClick={() => selectTemplate(template.id)}>Create Post</button></article>)}</div>
  </section>;
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
