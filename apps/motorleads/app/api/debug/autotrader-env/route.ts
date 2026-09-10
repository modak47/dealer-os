import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const variableNames = [
  "AUTOTRADER_API_KEY",
  "AUTOTRADER_API_SECRET",
  "AUTOTRADER_ADVERTISER_ID",
  "AUTOTRADER_API_URL",
] as const;

export async function GET() {
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    variables: Object.fromEntries(variableNames.map(name => [name, Boolean(process.env[name]?.trim())])),
  });
}
