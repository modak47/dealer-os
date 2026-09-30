import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendNewOfferNotification } from "../../../lib/seller-delivery";

export const dynamic = "force-dynamic";

function authorised(request: Request) {
  const expected = process.env.MOTORGEEKS_INTERNAL_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const websiteLeadId = Number(body.websiteLeadId);
  const offerId = typeof body.offerId === "string" ? body.offerId : "";
  if (body.event !== "offer_received" || !Number.isInteger(websiteLeadId) || websiteLeadId <= 0 || !/^[0-9a-f-]{36}$/i.test(offerId)) {
    return NextResponse.json({ error: "Invalid notification request." }, { status: 400 });
  }
  const result = await sendNewOfferNotification(websiteLeadId, offerId);
  return NextResponse.json(result, { status: result.status === "failed" ? 502 : 200 });
}
