import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { createCollection, getCollections } from "@/lib/collections";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const url = new URL(request.url);
    return NextResponse.json(await getCollections(url.searchParams.get("view") || "upcoming", url.searchParams.get("stockId"), url.searchParams.get("assigned") || "all"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load collections." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = await createCollection(body, await getCurrentUserId());
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to schedule collection.";
    const conflict = /duplicate|unique|active collection/i.test(message);
    return NextResponse.json({ error: conflict ? "This stock record already has an active collection." : message }, { status: conflict ? 409 : 400 });
  }
}
