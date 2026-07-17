import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { addStockCost } from "@/lib/stock-costs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireStaffUser())) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const costId = await addStockCost(id, body);
    return NextResponse.json({ costId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add stock cost." }, { status: 400 });
  }
}
