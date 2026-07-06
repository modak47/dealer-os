"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const statuses = ["New", "Contacted", "Qualified", "Appointment Booked", "Test Ride", "Negotiation", "Reserved", "Sold", "Lost"];
const interests = ["", "Low", "Medium", "High", "Hot"];

type EditableLead = {
  id: string; status: string; interest_level: string | null; preferred_bike_notes: string | null;
  trade_in: boolean; trade_in_registration: string | null; notes: string | null; lost_reason?: string | null;
};

export function LeadEditor({ lead }: { lead: EditableLead }) {
  const router = useRouter();
  const [status, setStatus] = useState(lead.status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function update(payload: Record<string, unknown>) {
    setSaving(true); setMessage("");
    const response = await fetch(`/api/crm/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) { setMessage(result.error || "Unable to update lead."); return false; }
    setMessage("Lead updated."); router.refresh(); return true;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await update({ ...Object.fromEntries(form), trade_in: form.get("trade_in") === "on" });
  }

  async function markLost() {
    const reason = window.prompt("Why was this lead lost or cancelled?");
    if (!reason) return;
    if (await update({ status: "Lost", lost_reason: reason })) setStatus("Lost");
  }

  return <form className="stock-editor-panel crm-form lead-editor" onSubmit={save}>
    <header><div><h2>Edit lead</h2><p>Update progress, requirements and outcome without deleting its history.</p></div></header>
    <div className="stock-form-grid">
      <label><span>Status</span><select name="status" value={status} onChange={event => setStatus(event.target.value)}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span>Interest level</span><select name="interest_level" defaultValue={lead.interest_level ?? ""}>{interests.map(value => <option value={value} key={value}>{value || "Not set"}</option>)}</select></label>
      <label className="full"><span>Motorcycle requirements</span><textarea name="preferred_bike_notes" rows={3} defaultValue={lead.preferred_bike_notes ?? ""} /></label>
      <label><span>Part-exchange registration</span><input name="trade_in_registration" defaultValue={lead.trade_in_registration ?? ""} /></label>
      <label className="builder-toggle"><span>Part exchange involved</span><input name="trade_in" type="checkbox" defaultChecked={lead.trade_in} /></label>
      <label className="full"><span>Lead notes</span><textarea name="notes" rows={5} defaultValue={lead.notes ?? ""} /></label>
      {status === "Lost" && <label className="full"><span>Lost/cancellation reason</span><textarea name="lost_reason" rows={3} defaultValue={lead.lost_reason ?? ""} required /></label>}
    </div>
    {message && <p className="stock-save-message">{message}</p>}
    <div className="lead-editor-actions"><button type="button" className="danger-action" onClick={markLost} disabled={saving || status === "Lost"}>Mark lost / cancel lead</button>{status === "Lost" && <button type="button" onClick={() => { setStatus("New"); void update({ status: "New", lost_reason: null }); }} disabled={saving}>Reopen lead</button>}<button className="admin-primary" disabled={saving}>{saving ? "Saving…" : "Save lead"}</button></div>
  </form>;
}
