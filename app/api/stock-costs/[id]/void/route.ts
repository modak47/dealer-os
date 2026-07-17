import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { voidStockCost } from "@/lib/stock-costs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireStaffUser())) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reversalCostId = await voidStockCost(id, body.reason || "");
    return NextResponse.json({ reversalCostId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to void stock cost." }, { status: 400 });
  }
}
