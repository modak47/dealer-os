import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type Dealer5ShadowRow = {
  stock_bike_id: number;
  registration: string | null;
  stock_number: string | null;
  make: string | null;
  model: string | null;
  yesmoto_status: string | null;
  dealer5_status: string | null;
  yesmoto_price: number | null;
  dealer5_price: number | null;
  yesmoto_image_count: number;
  dealer5_updated_at: string | null;
  yesmoto_updated_at: string | null;
  show_on_website: boolean | null;
  has_active_reservation: boolean;
  has_active_sale: boolean;
  health_status: string;
};

export async function getDealer5ShadowHealth() {
  const { data, error } = await getSupabaseAdmin()
    .from("dealer5_shadow_health")
    .select("*")
    .order("health_status")
    .order("registration");

  if (error) {
    if (["42P01", "42703", "PGRST205"].includes(error.code ?? "")) {
      return { migrationReady: false, rows: [] as Dealer5ShadowRow[], counts: {} as Record<string, number> };
    }
    throw error;
  }

  const rows = (data ?? []) as Dealer5ShadowRow[];
  return {
    migrationReady: true,
    rows,
    counts: rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.health_status] = (acc[row.health_status] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
