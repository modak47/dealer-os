"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PublicStockBike } from "@/lib/stock";
import type { SocialChannel, SocialQueueItem, SocialTemplate } from "@/lib/social-automation";

export function SocialAutomationClient({ channels, templates, queue, stock }: { channels: SocialChannel[]; templates: SocialTemplate[]; queue: SocialQueueItem[]; stock: PublicStockBike[] }) {
  const router = useRouter();
  const [bikeId, setBikeId] = useState(stock[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates.find(template => template.active)?.id ?? "");
  const [platform, setPlatform] = useState(channels[0]?.platform ?? "facebook");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedBike = stock.find(bike => bike.id === bikeId);
  const selectedTemplate = templates.find(template => template.id === templateId);
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

  async function queuePost() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/crm/social-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock_bike_id: bikeId, template_id: templateId, platform }),
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

  return <div className="social-automation">
    <section className="social-status-grid">
      {channels.map(channel => <article key={channel.id}><span>{platformLabel(channel.platform)}</span><b>{channel.display_name}</b><em className={channel.status}>{channel.status.replaceAll("_", " ")}</em><small>{channel.posting_enabled ? "Posting enabled" : "Manual setup required"}</small></article>)}
    </section>

    <section className="social-compose-panel">
      <div>
        <h2>Create Draft Post</h2>
        <p>Generate a stock post for review. This does not publish externally yet.</p>
      </div>
      <div className="social-compose-form">
        <label><span>Bike</span><select value={bikeId} onChange={event => setBikeId(event.target.value)}>{stock.map(bike => <option value={bike.id} key={bike.id}>{bike.year} {bike.make} {bike.model} - {money(bike.price)}</option>)}</select></label>
        <label><span>Template</span><select value={templateId} onChange={event => setTemplateId(event.target.value)}>{templates.filter(template => template.active).map(template => <option value={template.id} key={template.id}>{template.name}</option>)}</select></label>
        <label><span>Platform</span><select value={platform} onChange={event => setPlatform(event.target.value)}>{channels.map(channel => <option value={channel.platform} key={channel.id}>{platformLabel(channel.platform)}</option>)}</select></label>
        <button type="button" onClick={() => void queuePost()} disabled={busy || !bikeId || !templateId}>{busy ? "Queueing..." : "Queue Draft"}</button>
      </div>
      <div className="social-preview">
        {selectedBike && <img src={selectedBike.image} alt={`${selectedBike.make} ${selectedBike.model}`} />}
        <p>{preview || "Choose a bike and template to preview the caption."}</p>
      </div>
      {message && <p className={message.includes("queued") ? "stock-save-message success" : "stock-save-message"}>{message}</p>}
    </section>

    <div className="social-admin-grid">
      <section>
        <div className="panel-title"><h2>Eligible Stock</h2><span>{stock.length} ready</span></div>
        <div className="social-stock-list">{stock.slice(0, 8).map(bike => <article key={bike.id}><img src={bike.image} alt={`${bike.make} ${bike.model}`} /><div><b>{bike.year} {bike.make} {bike.model}</b><span>{bike.mileage} - {money(bike.price)}</span></div></article>)}</div>
      </section>
      <section>
        <div className="panel-title"><h2>Latest Queue</h2><span>{queue.length} recent</span></div>
        <div className="social-queue-list">{queue.length ? queue.map(item => <article key={item.id}><b>{platformLabel(item.platform)} - {item.status}</b><span>{item.caption}</span><small>{item.scheduled_for ? new Date(item.scheduled_for).toLocaleString("en-GB") : new Date(item.created_at).toLocaleString("en-GB")}</small></article>) : <p>No draft posts queued yet.</p>}</div>
      </section>
    </div>
  </div>;
}

function platformLabel(value: string) {
  return ({ facebook: "Facebook", instagram: "Instagram", pinterest: "Pinterest", google_business: "Google Business" } as Record<string, string>)[value] ?? value;
}

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}
