import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCollectionIcs } from "@/lib/collections";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const { id } = await params;
    const calendar = await getCollectionIcs(id);
    return new NextResponse(calendar.content, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${calendar.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create calendar file." }, { status: 400 });
  }
}
