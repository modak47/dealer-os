"use client";

import { useEffect, useState } from "react";
import { stockAttachmentTypes, type StockAttachment, type StockAttachmentType } from "@/lib/stock-attachment-types";

const fileSize = (value: number | null) => value ? `${(value / 1024 / 1024).toFixed(2)} MB` : "—";

export function StockAttachmentsCard({ stockBikeId, compact = false }: { stockBikeId: string; compact?: boolean }) {
  const [attachments, setAttachments] = useState<StockAttachment[]>([]);
  const [type, setType] = useState<StockAttachmentType>("PDI Form");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/stock-attachments?stock_bike_id=${encodeURIComponent(stockBikeId)}`);
    const body = await response.json();
    if (response.ok) setAttachments(body.attachments || []);
    else setError(body.error || "Unable to load attachments.");
  }

  useEffect(() => { void load(); }, [stockBikeId]);

  async function upload() {
    if (!file) { setError("Choose a PDF or image first."); return; }
    setBusy(true); setError(""); setMessage("");
    const form = new FormData();
    form.set("stock_bike_id", stockBikeId);
    form.set("attachment_type", type);
    form.set("notes", notes);
    form.set("file", file);
    const response = await fetch("/api/stock-attachments", { method: "POST", body: form });
    const body = await response.json();
    if (response.ok) {
      setFile(null); setNotes(""); setMessage("Attachment uploaded."); await load();
    } else setError(body.error || "Unable to upload attachment.");
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Delete this attachment?")) return;
    setBusy(true); setError(""); setMessage("");
    const response = await fetch(`/api/stock-attachments/${id}`, { method: "DELETE" });
    const body = await response.json();
    if (response.ok) { setMessage("Attachment deleted."); await load(); }
    else setError(body.error || "Unable to delete attachment.");
    setBusy(false);
  }

  return <section className={`stock-attachments-card ${compact ? "compact" : ""}`}>
    <header><div><h2>Attachments</h2><p>PDI forms, V5, MOT certificates, service history, invoices and other stock documents.</p></div><a href={`/admin/stock/${stockBikeId}/pdi`}>Digital PDI</a></header>
    <div className="attachment-uploader">
      <select value={type} onChange={(event) => setType(event.target.value as StockAttachmentType)}>{stockAttachmentTypes.map(item => <option key={item}>{item}</option>)}</select>
      <input type="file" accept="application/pdf,image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
      <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes, document reference..." />
      <button type="button" onClick={() => void upload()} disabled={busy}>{busy ? "Uploading..." : "Upload"}</button>
    </div>
    {error && <p className="invoice-error">{error}</p>}
    {message && <p className="invoice-success">{message}</p>}
    <div className="attachment-list">{attachments.map((attachment) => <article key={attachment.id}>
      <div><b>{attachment.attachment_type}</b><span>{attachment.file_name}</span><small>{fileSize(attachment.file_size)} · {new Date(attachment.created_at).toLocaleString("en-GB")}</small>{attachment.notes && <p>{attachment.notes}</p>}</div>
      <nav><a href={`/api/stock-attachments/${attachment.id}`} target="_blank" rel="noreferrer">View / Download</a><button type="button" onClick={() => void remove(attachment.id)} disabled={busy}>Delete</button></nav>
    </article>)}{!attachments.length && <p className="workflow-empty">No attachments uploaded yet.</p>}</div>
  </section>;
}
