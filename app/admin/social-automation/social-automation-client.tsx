"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import type { PublicStockBike } from "@/lib/stock";
import type { SocialChannel, SocialPublishingBike, SocialPublishingStatus, SocialQueueItem, SocialTemplate } from "@/lib/social-automation";

export function SocialAutomationClient({ channels, templates, queue, stock, publishingOverview }: { channels: SocialChannel[]; templates: SocialTemplate[]; queue: SocialQueueItem[]; stock: PublicStockBike[]; publishingOverview: SocialPublishingBike[] }) {
  const router = useRouter();
  const [bikeId, setBikeId] = useState(stock[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates.find(template => template.active)?.id ?? "");
  const [platform, setPlatform] = useState(channels[0]?.platform ?? "facebook");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedBike = stock.find(bike => bike.id === bikeId);
  const selectedTemplate = templates.find(template => template.id === templateId);
  const selectedChannel = channels.find(channel => channel.platform === platform);
  const displayImages = selectedBike?.imageUrls.filter(image => image && !image.includes("bike-placeholder")).slice(0, 4) ?? [];
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

  async function queuePost() {
    const selectedBikeId = String(selectedBike?.id ?? bikeId ?? "");
    setBusy(true);
    setMessage("");
    try {
      if (!selectedBikeId) throw new Error("Choose a bike.");
      const response = await fetch("/api/crm/social-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock_bike_id: selectedBikeId, bike_id: selectedBikeId, template_id: templateId, platform }),
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

    <section className="social-publishing-panel">
      <div className="panel-title"><h2>Publishing Overview</h2><span>{publishingOverview.length} bikes</span></div>
      <div className="social-publishing-table">
        <div className="social-publishing-row social-publishing-head">
          <span>Bike</span>
          <span>Website</span>
          {channels.map(channel => <span key={channel.id}>{platformLabel(channel.platform)}</span>)}
          <span>Auto Trader</span>
        </div>
        {publishingOverview.map(bike => <div className="social-publishing-row" key={bike.stockBikeId}>
          <div className="social-publishing-bike">
            <img src={bike.image} alt={bike.title} onError={fallbackImage} />
            <div><b>{bike.title}</b><small>{bike.status} · {money(bike.price)}</small></div>
          </div>
          <StatusPill item={bike.website} />
          {bike.channels.map(item => <StatusPill item={item} key={item.platform} />)}
          <StatusPill item={bike.autotrader} />
        </div>)}
        {!publishingOverview.length ? <p>No stock is ready for social posting yet.</p> : null}
      </div>
    </section>

    <section className="social-compose-panel">
      <div>
        <h2>Create Draft Post</h2>
        <p>Generate a stock post for review. Queueing creates the draft; publishing is held until the channel connection is live.</p>
      </div>
      <div className="social-compose-form">
        <label><span>Bike</span><select value={bikeId} onChange={event => setBikeId(event.target.value)}>{stock.map(bike => <option value={bike.id} key={bike.id}>{bike.year} {bike.make} {bike.model} - {money(bike.price)}</option>)}</select></label>
        <label><span>Template</span><select value={templateId} onChange={event => setTemplateId(event.target.value)}>{templates.filter(template => template.active).map(template => <option value={template.id} key={template.id}>{template.name}</option>)}</select></label>
        <label><span>Platform</span><select value={platform} onChange={event => setPlatform(event.target.value)}>{channels.map(channel => <option value={channel.platform} key={channel.id}>{platformLabel(channel.platform)}</option>)}</select></label>
        <button type="button" onClick={() => void queuePost()} disabled={busy || !bikeId || !templateId}>{busy ? "Queueing..." : "Queue Draft"}</button>
      </div>
      {selectedBike ? <div className={`social-creative-preview ${platform}`}>
        <div className="social-preview-art">
          <div className="social-preview-main">
            <img src={displayImages[0] || selectedBike.image} alt={previewTitle} onError={fallbackImage} />
            <strong>{money(selectedBike.price)}</strong>
          </div>
          <div className="social-preview-ribbon"><b>YES MOTO</b><span>Delivery · Part exchange · Finance</span></div>
          <div className="social-preview-thumbs">
            {(displayImages.length ? displayImages : [selectedBike.image]).slice(0, 3).map((image, index) => <img src={image} alt={`${previewTitle} preview ${index + 1}`} onError={fallbackImage} key={`${image}-${index}`} />)}
          </div>
          <div className="social-preview-footer"><b>{previewTitle}</b><span>{selectedBike.variant || selectedBike.mileage}</span></div>
        </div>
        <div className="social-preview-copy">
          <small>{platformLabel(platform)} draft preview</small>
          <h3>{selectedChannel?.posting_enabled ? "Ready to publish after approval" : "Connection needed before publishing"}</h3>
          <p>{preview || "Choose a bike and template to preview the caption."}</p>
          <a href={`/used-bikes/${selectedBike.slug}`} target="_blank" rel="noreferrer">View website advert</a>
        </div>
      </div> : <div className="social-preview-empty">Choose a bike and template to preview the post.</div>}
      {message && <p className={message.includes("queued") ? "stock-save-message success" : "stock-save-message"}>{message}</p>}
    </section>

    <div className="social-admin-grid">
      <section>
        <div className="panel-title"><h2>Stock Available For Posts</h2><span>{stock.length} bikes</span></div>
        <div className="social-stock-list">{stock.map(bike => <article key={bike.id} className={bike.id === bikeId ? "selected" : ""} onClick={() => setBikeId(bike.id)}><img src={bike.image} alt={`${bike.make} ${bike.model}`} onError={fallbackImage} /><div><b>{bike.year} {bike.make} {bike.model}</b><span>{bike.status} · {bike.mileage} · {money(bike.price)}</span></div></article>)}</div>
      </section>
      <section>
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
      </section>
    </div>
  </div>;
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
