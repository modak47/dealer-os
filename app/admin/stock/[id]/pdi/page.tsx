import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { normalizeSupabaseStockBike } from "@/lib/supabase-stock";
import { defaultPdiChecklist, type PdiChecklistItem } from "@/lib/stock-pdi-types";
import { PdiForm } from "./pdi-form";

export const dynamic = "force-dynamic";

export default async function StockPdiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const [{ data: bike, error: bikeError }, { data: pdi }] = await Promise.all([
    db.from("stock_bikes").select("*").eq("id", id).maybeSingle(),
    db.from("stock_pdi_checks").select("checklist").eq("stock_bike_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (bikeError) throw new Error("Unable to load stock bike.");
  if (!bike) notFound();
  const checklist = Array.isArray(pdi?.checklist) ? pdi.checklist as PdiChecklistItem[] : defaultPdiChecklist;
  return <PdiForm bike={normalizeSupabaseStockBike(bike as SupabaseStockBike)} initialChecklist={checklist} />;
}
