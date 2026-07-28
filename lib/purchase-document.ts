import "server-only";

import { notFound } from "next/navigation";
import { dealerAddress, getDealerSettings } from "@/lib/dealer-settings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PurchaseDocument = {
  purchase: Record<string, unknown>;
  supplier: Record<string, unknown> | null;
  bike: Record<string, unknown>;
  settings: Awaited<ReturnType<typeof getDealerSettings>>;
  dealerAddress: string;
  documentNumber: string;
  bikeName: string;
  sellerName: string;
};

export async function getPurchaseDocument(id: string): Promise<PurchaseDocument> {
  const db = getSupabaseAdmin();
  const { data: purchase, error } = await db.from("stock_purchases").select("*").eq("id", id).maybeSingle();
  if (error || !purchase) notFound();

  const purchaseRow = purchase as Record<string, unknown>;
  const [settings, bikeResult, supplierResult] = await Promise.all([
    getDealerSettings(),
    db.from("stock_bikes").select("*").eq("id", purchaseRow.stock_bike_id as number).maybeSingle(),
    purchaseRow.supplier_id ? db.from("stock_suppliers").select("*").eq("id", purchaseRow.supplier_id as string).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  if (bikeResult.error || !bikeResult.data) notFound();

  const bike = bikeResult.data as Record<string, unknown>;
  const supplier = supplierResult.data as Record<string, unknown> | null;
  const bikeName = [bike.year, bike.make, bike.model, bike.variant].filter(Boolean).join(" ") || "Motorcycle";
  const sellerName = [supplier?.name, supplier?.company_name].filter(Boolean).join(" / ") || String(bike.seller_name ?? "Seller");
  const documentNumber = `PUR-${String(bike.stock_number ?? purchaseRow.stock_bike_id)}-${String(purchaseRow.id).slice(0, 8).toUpperCase()}`;

  return { purchase: purchaseRow, supplier, bike, settings, dealerAddress: dealerAddress(settings), documentNumber, bikeName, sellerName };
}

export function moneyFromPence(value: unknown) {
  const pounds = Number(value ?? 0) / 100;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number.isFinite(pounds) ? pounds : 0);
}

export function dateText(value: unknown) {
  if (!value) return "";
  return new Date(String(value)).toLocaleDateString("en-GB");
}

export function lineValues(...values: unknown[]) {
  return values.map(value => String(value ?? "").trim()).filter(Boolean);
}
