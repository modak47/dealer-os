"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { defaultPdiChecklist, type PdiChecklistItem, type PdiResult } from "@/lib/stock-pdi-types";

export function PdiForm({ bike, initialChecklist = defaultPdiChecklist }: { bike: SupabaseStockBike; initialChecklist?: PdiChecklistItem[] }) {
  const [checklist, setChecklist] = useState<PdiChecklistItem[]>(initialChecklist.length ? initialChecklist : defaultPdiChecklist);
  const [technicianName, setTechnicianName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  function update(index: number, values: Partial<PdiChecklistItem>) {
    setChecklist((rows) => rows.map((row, i) => i === index ? { ...row, ...values } : row));
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = event.currentTarget.getContext("2d");
    const p = point(event);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d");
    const p = point(event);
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function completePdi() {
    setBusy(true); setError(""); setMessage("");
    const signatureDataUrl = canvasRef.current?.toDataURL("image/png") || "";
    const response = await fetch(`/api/stock/${bike.id}/pdi`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checklist, technicianName, signatureDataUrl }) });
    const body = await response.json();
    if (response.ok) setMessage("PDI completed. PDF saved to stock attachments.");
    else setError(body.error || "Unable to complete PDI.");
    setBusy(false);
  }

  const sections = Array.from(new Set(checklist.map((item) => item.section)));

  return <div className="admin-page pdi-page">
    <div className="stock-editor-heading"><div><Link href={`/admin/stock/${bike.id}`}>← Back to stock bike</Link><h1>Digital PDI</h1><p>{[bike.year, bike.make, bike.model, bike.registration].filter(Boolean).join(" · ")}</p></div><button className="admin-primary" onClick={() => void completePdi()} disabled={busy}>{busy ? "Generating PDI..." : "Complete PDI"}</button></div>
    {error && <p className="invoice-error">{error}</p>}{message && <p className="invoice-success">{message}</p>}
    <section className="pdi-bike-card"><div><span>Make / model</span><b>{bike.make} {bike.model}</b></div><div><span>Registration</span><b>{bike.registration || "—"}</b></div><div><span>VIN</span><b>{bike.vin || "—"}</b></div><div><span>Mileage</span><b>{bike.mileage?.toLocaleString("en-GB") || "—"}</b></div><div><span>Date</span><b>{new Date().toLocaleDateString("en-GB")}</b></div></section>
    <div className="pdi-checklist">{sections.map((section) => <section key={section}><header><h2>{section}</h2></header>{checklist.map((item, index) => item.section === section ? <article key={item.id}><label><input type="checkbox" checked={item.checked} onChange={(event) => update(index, { checked: event.target.checked })} /> {item.label}</label><select value={item.result} onChange={(event) => update(index, { result: event.target.value as PdiResult })}><option value="pass">Pass</option><option value="fail">Fail</option><option value="na">N/A</option></select><input value={item.notes} onChange={(event) => update(index, { notes: event.target.value })} placeholder="Notes" /></article> : null)}</section>)}</div>
    <section className="pdi-signature"><label><span>Technician name</span><input value={technicianName} onChange={(event) => setTechnicianName(event.target.value)} placeholder="Name of technician completing PDI" /></label><div><span>Technician signature</span><canvas ref={canvasRef} width={720} height={180} onPointerDown={startDraw} onPointerMove={draw} onPointerUp={() => drawing.current = false} onPointerLeave={() => drawing.current = false} /><button type="button" onClick={clearSignature}>Clear signature</button></div></section>
  </div>;
}
