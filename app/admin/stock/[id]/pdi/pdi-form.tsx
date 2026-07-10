"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { defaultPdiChecklist, pdiSections, type PdiChecklistItem, type PdiResult } from "@/lib/stock-pdi-types";

function validChecklist(value: PdiChecklistItem[]) {
  return value.length && value.every((item) => typeof item.number === "number" && pdiSections.includes(item.section));
}

function SignaturePad({ label, onChange }: { label: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function emit() {
    onChange(canvasRef.current?.toDataURL("image/png") || "");
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = event.currentTarget.getContext("2d");
    const p = point(event);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(event);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    emit();
  }
  function end() {
    drawing.current = false;
    emit();
  }
  function clear() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }
  return <div><span>{label}</span><canvas ref={canvasRef} width={720} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} /><button type="button" onClick={clear}>Clear signature</button></div>;
}

export function PdiForm({ bike, initialChecklist = defaultPdiChecklist }: { bike: SupabaseStockBike; initialChecklist?: PdiChecklistItem[] }) {
  const [checklist, setChecklist] = useState<PdiChecklistItem[]>(validChecklist(initialChecklist) ? initialChecklist : defaultPdiChecklist);
  const [technicianName, setTechnicianName] = useState("");
  const [technicianSignature, setTechnicianSignature] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerSignature, setCustomerSignature] = useState("");
  const [completionConfirmed, setCompletionConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function update(id: string, values: Partial<PdiChecklistItem>) {
    setChecklist((rows) => rows.map((row) => row.id === id ? { ...row, ...values } : row));
  }

  async function completePdi() {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch(`/api/stock/${bike.id}/pdi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist, technicianName, signatureDataUrl: technicianSignature, customerName, customerSignatureDataUrl: customerSignature, completionConfirmed }),
    });
    const body = await response.json();
    if (response.ok) setMessage("PDI completed. PDF saved to stock attachments and workshop task marked complete.");
    else setError(body.error || "Unable to complete PDI.");
    setBusy(false);
  }

  const rows = Math.max(...pdiSections.map((section) => checklist.filter((item) => item.section === section).length));

  return <div className="admin-page pdi-page yesmoto-pdi-page">
    <div className="stock-editor-heading"><div><Link href={`/admin/stock/${bike.id}`}>← Back to stock bike</Link><h1>Used bike PDI sheet</h1><p>{[bike.year, bike.make, bike.model, bike.registration].filter(Boolean).join(" · ")}</p></div><button className="admin-primary" onClick={() => void completePdi()} disabled={busy}>{busy ? "Generating PDI..." : "Complete PDI"}</button></div>
    {error && <p className="invoice-error">{error}</p>}{message && <p className="invoice-success">{message}</p>}

    <section className="pdi-paper">
      <header className="pdi-paper-head"><div><b>SELL YOUR MOTORBIKE LTD T/A YES MOTO</b><span>72 Brentwood Road</span><span>Brighton BN1 7ES</span><span>Tel: 07984 763470</span><span>www.yesmoto.co.uk</span></div><img src="/yesmoto-logo.png" alt="YesMoto" /></header>
      <h2>USED BIKE PRE-DELIVERY INSPECTION [PDI] SHEET</h2>
      <div className="pdi-details-grid"><b>BIKE MAKE & MODEL</b><span>{[bike.make, bike.model, bike.variant].filter(Boolean).join(" ") || "—"}</span><b>VEHICLE ID. [VIN]</b><span>{bike.vin || "—"}</span><b>ENGINE NO.</b><span>{bike.engine_number || "—"}</span><b>REG NO.</b><span>{bike.registration || "—"}</span><b>DATE.</b><span>{new Date().toLocaleDateString("en-GB")}</span></div>
      <p className="pdi-warning">VISUALLY INSPECT THE BIKE FOR MISSING PARTS. CHECK TYRES, CHAIN & SPROCKETS AND BRAKE PAD CONDITION BEFORE CARRYING OUT PDI, REPORT IF ANYTHING NEEDS REPLACING TO PARTS DEPARTMENT</p>
      <p className="pdi-tts">TTS = TORQUE TO SPEC</p>
      <div className="pdi-four-column" style={{ ["--pdi-rows" as string]: rows }}>{pdiSections.map((section) => <section key={section}><h3>{section}</h3>{checklist.filter((item) => item.section === section).map((item) => <article key={item.id} className={/dealer stamp/i.test(item.label) ? "stamp-row" : ""}><label><input type="checkbox" checked={item.checked} onChange={(event) => update(item.id, { checked: event.target.checked })} /><strong>{item.number}</strong><span>{item.label}</span></label><select value={item.result} onChange={(event) => update(item.id, { result: event.target.value as PdiResult })}><option value="pass">Pass</option><option value="fail">Fail</option><option value="na">N/A</option></select><input value={item.notes} onChange={(event) => update(item.id, { notes: event.target.value })} placeholder="Notes" /></article>)}</section>)}</div>
      <label className="pdi-notes-area"><span>Technician notes</span><textarea rows={4} placeholder="Add notes against individual checklist rows above. They will appear on the generated PDF." readOnly /></label>
      <p className="pdi-declaration"><b>DEALER DECLARATION:</b> I hereby declare that all pre-delivery checks have been completed.</p>
      <div className="pdi-signature pdi-signature-grid"><label><span>Print name</span><input value={technicianName} onChange={(event) => setTechnicianName(event.target.value)} placeholder="Technician print name" /></label><SignaturePad label="Technician signature" onChange={setTechnicianSignature} /><label><span>Customer print name</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer print name" /></label><SignaturePad label="Customer acceptance / signature" onChange={setCustomerSignature} /></div>
      <p className="pdi-declaration"><b>PURCHASER ACCEPTANCE:</b> I have inspected the machine on collection/delivery and it meets with my satisfaction. I have been advised on the operation, routine servicing and safety precautions. I understand my entitlements to warranty.</p>
      <label className="pdi-confirm"><input type="checkbox" checked={completionConfirmed} onChange={(event) => setCompletionConfirmed(event.target.checked)} /> I confirm the PDI is complete and I am ready to generate the final PDF with the YesMoto dealer stamp.</label>
    </section>
  </div>;
}
