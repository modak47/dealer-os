import { NextResponse } from "next/server";
import { loadCustomerPortal } from "@/lib/customer-portal";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; code?: string };
    const result = await loadCustomerPortal({ email: body.email ?? "", code: body.code ?? "" });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("Customer portal lookup failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Unable to load your portal right now. Please contact the team." }, { status: 500 });
  }
}
