import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ReservationAddon = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price: number;
  duration_months: number | null;
  display_order: number;
  active: boolean;
  icon: string | null;
  badge: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ReservationAddonInput = Partial<Omit<ReservationAddon, "id" | "created_at" | "updated_at">> & { id?: string };

export function normaliseAddon(row: Record<string, unknown>): ReservationAddon {
  return {
    id: String(row.id),
    category: String(row.category ?? "").trim(),
    name: String(row.name ?? "").trim(),
    description: typeof row.description === "string" ? row.description : null,
    price: Number(row.price ?? 0),
    duration_months: row.duration_months == null ? null : Number(row.duration_months),
    display_order: Number(row.display_order ?? 0),
    active: row.active !== false,
    icon: typeof row.icon === "string" ? row.icon : null,
    badge: typeof row.badge === "string" ? row.badge : null,
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export async function getReservationAddons({ activeOnly = false } = {}) {
  let query = getSupabaseAdmin().from("reservation_addons").select("*").order("category").order("display_order").order("name");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(row => normaliseAddon(row as Record<string, unknown>));
}

export async function getReservationAddonSnapshots(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return [];
  const { data, error } = await getSupabaseAdmin().from("reservation_addons").select("*").in("id", uniqueIds).eq("active", true);
  if (error) throw error;
  const addons = (data ?? []).map(row => normaliseAddon(row as Record<string, unknown>));
  if (addons.length !== uniqueIds.length) throw new Error("One or more selected reservation extras are no longer available.");
  const counts = new Map<string, number>();
  for (const addon of addons) counts.set(addon.category, (counts.get(addon.category) ?? 0) + 1);
  for (const category of ["warranty", "delivery"]) {
    if ((counts.get(category) ?? 0) > 1) throw new Error(`Choose one ${category} option.`);
  }
  return uniqueIds.map(id => addons.find(addon => addon.id === id)).filter(Boolean).map(addon => ({
    id: addon!.id,
    category: addon!.category,
    name: addon!.name,
    description: addon!.description,
    price: addon!.price,
    quantity: 1,
    duration_months: addon!.duration_months,
    icon: addon!.icon,
    badge: addon!.badge,
  }));
}

export function cleanAddonInput(input: ReservationAddonInput) {
  const category = String(input.category ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim();
  if (!category) throw new Error("Category is required.");
  if (!name) throw new Error("Name is required.");
  return {
    category,
    name,
    description: typeof input.description === "string" && input.description.trim() ? input.description.trim() : null,
    price: Math.max(0, Number(input.price ?? 0)),
    duration_months: input.duration_months == null || input.duration_months === undefined ? null : Math.max(0, Number(input.duration_months)),
    display_order: Number(input.display_order ?? 0),
    active: input.active !== false,
    icon: typeof input.icon === "string" && input.icon.trim() ? input.icon.trim().slice(0, 40) : null,
    badge: typeof input.badge === "string" && input.badge.trim() ? input.badge.trim().slice(0, 80) : null,
  };
}
