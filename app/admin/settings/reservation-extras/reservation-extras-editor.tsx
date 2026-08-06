"use client";

import { useMemo, useState } from "react";
import type { ReservationAddon } from "@/lib/reservation-addons";

type DraftAddon = ReservationAddon & { saving?: boolean; local?: boolean };

const blankAddon = (): DraftAddon => ({
  id: `new-${crypto.randomUUID()}`,
  category: "warranty",
  name: "",
  description: "",
  price: 0,
  duration_months: null,
  display_order: 100,
  active: true,
  icon: "",
  badge: "",
  local: true,
});

export function ReservationExtrasEditor({ initialAddons }: { initialAddons: ReservationAddon[] }) {
  const [addons, setAddons] = useState<DraftAddon[]>(initialAddons);
  const [message, setMessage] = useState("");
  const grouped = useMemo(() => groupAddons(addons), [addons]);

  function update(id: string, updates: Partial<DraftAddon>) {
    setAddons(current => current.map(addon => addon.id === id ? { ...addon, ...updates } : addon));
  }

  async function save(addon: DraftAddon) {
    setMessage("");
    update(addon.id, { saving: true });
    try {
      const response = await fetch("/api/crm/reservation-addons", {
        method: addon.local ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addon),
      });
      const result = await response.json() as { addon?: ReservationAddon; error?: string };
      if (!response.ok || !result.addon) throw new Error(result.error || "Unable to save reservation extra.");
      setAddons(current => current.map(item => item.id === addon.id ? { ...result.addon!, local: false } : item));
      setMessage("Reservation extra saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save reservation extra.");
      update(addon.id, { saving: false });
    }
  }

  return <section className="reservation-extras-admin">
    <div className="admin-card-head"><div><h2>Reservation Extras</h2><p>Manage warranty packages, delivery options and future add-ons shown in the online reservation builder.</p></div><button type="button" onClick={() => setAddons(current => [blankAddon(), ...current])}>Add extra</button></div>
    {message && <p className={message.endsWith("saved.") ? "stock-save-message success" : "stock-save-message"}>{message}</p>}
    {grouped.map(([category, rows]) => <section className="reservation-extras-group" key={category}><h3>{category}</h3><div>{rows.map(addon => <article className={!addon.active ? "disabled" : ""} key={addon.id}>
      <label><span>Category</span><input value={addon.category} onChange={event => update(addon.id, { category: event.target.value })} /></label>
      <label><span>Name</span><input value={addon.name} onChange={event => update(addon.id, { name: event.target.value })} /></label>
      <label><span>Price</span><input type="number" min="0" step="1" value={addon.price} onChange={event => update(addon.id, { price: Number(event.target.value) })} /></label>
      <label><span>Duration months</span><input type="number" min="0" value={addon.duration_months ?? ""} onChange={event => update(addon.id, { duration_months: event.target.value === "" ? null : Number(event.target.value) })} /></label>
      <label><span>Order</span><input type="number" value={addon.display_order} onChange={event => update(addon.id, { display_order: Number(event.target.value) })} /></label>
      <label><span>Icon</span><input value={addon.icon ?? ""} onChange={event => update(addon.id, { icon: event.target.value })} placeholder="shield, truck, star" /></label>
      <label><span>Badge</span><input value={addon.badge ?? ""} onChange={event => update(addon.id, { badge: event.target.value })} placeholder="Most Popular" /></label>
      <label className="wide"><span>Description</span><textarea value={addon.description ?? ""} onChange={event => update(addon.id, { description: event.target.value })} placeholder={"First line is the subtitle. Extra lines become check-list bullets."} /></label>
      <label className="toggle"><input type="checkbox" checked={addon.active} onChange={event => update(addon.id, { active: event.target.checked })} /><span>Active</span></label>
      <button type="button" onClick={() => void save(addon)} disabled={addon.saving}>{addon.saving ? "Saving..." : "Save"}</button>
    </article>)}</div></section>)}
  </section>;
}

function groupAddons(addons: DraftAddon[]) {
  const map = new Map<string, DraftAddon[]>();
  for (const addon of addons) {
    const key = addon.category || "uncategorised";
    map.set(key, [...(map.get(key) ?? []), addon]);
  }
  return [...map.entries()].map(([category, rows]) => [category, rows.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))] as const);
}
