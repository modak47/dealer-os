import { timingSafeEqual } from "node:crypto";
import { sendSellerDelivery } from "../../../lib/seller-delivery";
import { getSupabaseAdmin } from "../../../lib/supabase-server";

function hasValidCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";

  if (!expected) return false;

  const expectedHeader = `Bearer ${expected}`;
  return (
    Buffer.byteLength(supplied) === Buffer.byteLength(expectedHeader) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expectedHeader))
  );
}

async function processSellerDeliveryRetries(request: Request) {
  if (!hasValidCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("seller_email_deliveries")
    .select("id")
    .in("status", ["pending", "sending", "unknown", "failed", "not_configured"])
    .lt("attempts", 5)
    .gt("created_at", new Date(Date.now() - 3_600_000).toISOString())
    .order("created_at")
    .limit(20);

  if (error) {
    return Response.json({ error: "Delivery queue unavailable" }, { status: 503 });
  }

  for (const row of data ?? []) {
    await sendSellerDelivery(row.id);
  }

  return Response.json({ checked: data?.length ?? 0 });
}

export const GET = processSellerDeliveryRetries;
export const POST = processSellerDeliveryRetries;
