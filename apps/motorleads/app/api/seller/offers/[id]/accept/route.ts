import { NextResponse } from "next/server";
import { acceptSellerOffer } from "../../../../../lib/marketplace";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await acceptSellerOffer(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ offer: result.offer });
}
