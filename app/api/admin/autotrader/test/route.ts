import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getAutotraderConfig, hasAutotraderConfig, testAutotraderConnection } from "@/lib/autotrader";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireStaffUser())) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  if (!hasAutotraderConfig()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: "Auto Trader Connect is not configured. Add AUTOTRADER_API_KEY, AUTOTRADER_API_SECRET, AUTOTRADER_ADVERTISER_ID and AUTOTRADER_API_URL.",
    }, { status: 503 });
  }

  try {
    const result = await testAutotraderConnection();
    return NextResponse.json({
      ...result,
      configured: true,
      credentials: redactedConfig(),
    });
  } catch (error) {
    console.error("Auto Trader Connect test failed", error);
    return NextResponse.json({
      ok: false,
      configured: true,
      credentials: redactedConfig(),
      error: error instanceof Error ? error.message : "Unable to connect to Auto Trader Connect.",
    }, { status: 502 });
  }
}

function redactedConfig() {
  const config = getAutotraderConfig();
  return {
    apiUrl: config.apiUrl,
    advertiserId: config.advertiserId,
    apiKey: redact(config.apiKey),
    apiSecret: redact(config.apiSecret),
  };
}

function redact(value: string) {
  if (value.length <= 6) return "***";
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}
