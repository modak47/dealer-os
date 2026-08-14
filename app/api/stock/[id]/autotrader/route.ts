import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getAutotraderConfig, hasAutotraderConfig } from "@/lib/autotrader";
import { buildAutotraderStockPayload, validateAutotraderStockPayload } from "@/lib/autotrader-stock";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSupabaseStockBike } from "@/lib/supabase-stock";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const { id } = await params;
  const bike = await loadStockBike(id);
  if (!bike) return NextResponse.json({ error: "Stock bike not found." }, { status: 404 });

  const configured = hasAutotraderConfig();
  const advertiserId = configured ? getAutotraderConfig().advertiserId : "";
  const payload = buildAutotraderStockPayload(bike, advertiserId, false);
  const validation = validateAutotraderStockPayload(payload);

  return NextResponse.json({
    configured,
    sendEnabled: process.env.AUTOTRADER_STOCK_PUBLISHING_ENABLED === "true",
    stockId: bike.autotrader_stock_id ?? null,
    status: bike.autotrader_publish_status ?? "not_started",
    validation,
    payload,
    lastResponse: bike.autotrader_last_response ?? null,
    lastError: bike.autotrader_publish_error ?? null,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { publish?: boolean };
  const bike = await loadStockBike(id);
  if (!bike) return NextResponse.json({ error: "Stock bike not found." }, { status: 404 });
  if (!hasAutotraderConfig()) return NextResponse.json({ error: "Auto Trader Connect is not configured." }, { status: 503 });

  const config = getAutotraderConfig();
  const payload = buildAutotraderStockPayload(bike, config.advertiserId, Boolean(body.publish));
  const validation = validateAutotraderStockPayload(payload);
  if (!validation.ok) {
    return NextResponse.json({ error: `Auto Trader payload is missing: ${validation.missing.join(", ")}.`, validation, payload }, { status: 400 });
  }

  const sendEnabled = process.env.AUTOTRADER_STOCK_PUBLISHING_ENABLED === "true";
  const status = sendEnabled ? "draft_ready" : "draft_ready";
  const response = {
    dryRun: !sendEnabled,
    message: sendEnabled
      ? "Auto Trader stock publishing payload is ready. Live create/update is intentionally held until endpoint mapping is confirmed."
      : "Dry run only. Set AUTOTRADER_STOCK_PUBLISHING_ENABLED=true after confirming the Stock API create/update endpoint mapping with Auto Trader.",
  };

  const update = {
    autotrader_publish_status: status,
    autotrader_last_payload: payload,
    autotrader_last_response: response,
    autotrader_last_synced_at: new Date().toISOString(),
    autotrader_publish_error: null,
  };
  const { data, error } = await getSupabaseAdmin().from("stock_bikes").update(update).eq("id", id).select("*").maybeSingle();
  if (error) {
    const migrationMissing = /column|schema cache|autotrader_publish_status/i.test(`${error.message} ${error.details ?? ""}`);
    return NextResponse.json({
      error: migrationMissing
        ? "Auto Trader stock publishing migration is not installed. Run 20260814000100_autotrader_stock_publishing.sql in Supabase, then try again."
        : `Unable to save Auto Trader publish state: ${error.message}`,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sendEnabled, validation, payload, response, stock: data ? normalizeSupabaseStockBike(data as SupabaseStockBike) : null });
}

async function loadStockBike(id: string) {
  const { data, error } = await getSupabaseAdmin().from("stock_bikes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load stock bike: ${error.message}`);
  return data ? normalizeSupabaseStockBike(data as SupabaseStockBike) : null;
}
