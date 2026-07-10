"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { DealerContact } from "@/types/referral";

const emptyDealer: Partial<DealerContact> = {
  dealer_name: "",
  contact_name: "",
  email: "",
  mobile_number: "",
  landline_number: "",
  whatsapp_number: "",
  town: "",
  postcode: "",
  notes: "",
  preferred_contact_method: "email",
  active: true,
};

export default function DealerContactsPage() {
  const [dealers, setDealers] = useState<DealerContact[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("true");
  const [method, setMethod] = useState("");
  const [editing, setEditing] = useState<Partial<DealerContact> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (active) params.set("active", active);
    const response = await fetch(`/api/dealer-contacts?${params}`, { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setDealers(payload.dealers ?? []);
    else setError(payload.error || "Unable to load dealer contacts.");
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => method ? dealers.filter(dealer => dealer.preferred_contact_method === method) : dealers, [dealers, method]);
  const kpis = [
    ["Active Dealers", dealers.filter(dealer => dealer.active).length],
    ["Referrals This Month", dealers.reduce((total, dealer) => total + (dealer.last_referral_date && new Date(dealer.last_referral_date).getMonth() === new Date().getMonth() ? 1 : 0), 0)],
    ["Interested Dealers", dealers.reduce((total, dealer) => total + Number(dealer.successful_referrals ?? 0), 0)],
    ["Completed Referrals", dealers.reduce((total, dealer) => total + Number(dealer.total_referrals ?? 0), 0)],
  ];

  function setField(key: keyof typeof emptyDealer, value: string | boolean) {
    setEditing(current => ({ ...(current ?? emptyDealer), [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    setNotice("");
    const creating = !editing.id;
    const response = await fetch(creating ? "/api/dealer-contacts" : `/api/dealer-contacts/${editing.id}`, { method: creating ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    const payload = await response.json();
    if (response.ok) {
      setNotice(creating ? "Dealer contact created." : "Dealer contact updated.");
      setEditing(null);
      await load();
    } else setError(payload.error || "Unable to save dealer contact.");
    setSaving(false);
  }

  async function toggleActive(dealer: DealerContact) {
    const response = await fetch(`/api/dealer-contacts/${dealer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !dealer.active }) });
    if (response.ok) await load();
  }

  return <main className="admin-page dealer-contacts-page">
    <div className="admin-heading"><div><h1>Dealer Contacts</h1><p>Saved trade contacts for referring website purchase leads.</p></div><button className="admin-primary" onClick={() => setEditing(emptyDealer)}>Add Dealer</button></div>
    <section className="website-kpis">{kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="website-lead-controls dealer-contact-controls"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search dealer, town, email or phone" /><select value={active} onChange={event => setActive(event.target.value)}><option value="true">Active</option><option value="false">Inactive</option><option value="">All</option></select><select value={method} onChange={event => setMethod(event.target.value)}><option value="">All methods</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="phone">Phone</option></select><button onClick={() => void load()}>Search</button></section>
    {error && <div className="website-state error compact">{error}</div>}{notice && <div className="website-state success compact">{notice}</div>}
    {loading ? <div className="website-state">Loading dealers...</div> : <section className="dealer-contact-grid">{filtered.map(dealer => <article className="dealer-contact-card" key={dealer.id}><header><div><span>{dealer.active ? "Active" : "Inactive"}</span><h2>{dealer.dealer_name}</h2><p>{dealer.contact_name || "No named contact"} · {dealer.town || "Town not set"}</p></div><b>{dealer.preferred_contact_method}</b></header><dl><div><dt>Email</dt><dd>{dealer.email || "-"}</dd></div><div><dt>Mobile</dt><dd>{dealer.mobile_number || "-"}</dd></div><div><dt>WhatsApp</dt><dd>{dealer.whatsapp_number || "-"}</dd></div><div><dt>Last referral</dt><dd>{dealer.last_referral_date ? new Date(dealer.last_referral_date).toLocaleString("en-GB") : "-"}</dd></div><div><dt>Referrals</dt><dd>{dealer.total_referrals ?? 0}</dd></div></dl><nav><button onClick={() => setEditing(dealer)}>Edit</button><button className={dealer.active ? "danger" : ""} onClick={() => void toggleActive(dealer)}>{dealer.active ? "Disable" : "Reactivate"}</button></nav></article>)}</section>}
    {editing && <div className="website-modal-backdrop" role="dialog" aria-modal="true"><form className="website-book-modal dealer-contact-modal" onSubmit={save}><header><div><h2>{editing.id ? "Edit Dealer" : "Add Dealer"}</h2><p>Contacts are disabled rather than deleted so referral history remains valid.</p></div><button type="button" onClick={() => setEditing(null)}>Close</button></header><div className="website-book-grid"><Input label="Dealer name" value={editing.dealer_name ?? ""} set={v => setField("dealer_name", v)} required /><Input label="Contact name" value={editing.contact_name ?? ""} set={v => setField("contact_name", v)} /><Input label="Email" value={editing.email ?? ""} set={v => setField("email", v)} type="email" /><Input label="Mobile" value={editing.mobile_number ?? ""} set={v => setField("mobile_number", v)} /><Input label="Landline" value={editing.landline_number ?? ""} set={v => setField("landline_number", v)} /><Input label="WhatsApp" value={editing.whatsapp_number ?? ""} set={v => setField("whatsapp_number", v)} /><Input label="Town" value={editing.town ?? ""} set={v => setField("town", v)} /><Input label="Postcode" value={editing.postcode ?? ""} set={v => setField("postcode", v)} /><label><span>Preferred method</span><select value={editing.preferred_contact_method ?? "email"} onChange={event => setField("preferred_contact_method", event.target.value)}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="phone">Phone</option></select></label><label className="builder-toggle"><span>Active</span><input type="checkbox" checked={editing.active ?? true} onChange={event => setField("active", event.target.checked)} /><b>{editing.active ? "Yes" : "No"}</b></label><label className="full"><span>Notes</span><textarea value={editing.notes ?? ""} onChange={event => setField("notes", event.target.value)} /></label></div><footer><button type="button" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving..." : "Save Dealer"}</button></footer></form></div>}
  </main>;
}

function Input({ label, value, set, type = "text", required = false }: { label: string; value: string; set: (value: string) => void; type?: string; required?: boolean }) {
  return <label><span>{label}</span><input type={type} value={value} required={required} onChange={event => set(event.target.value)} /></label>;
}
