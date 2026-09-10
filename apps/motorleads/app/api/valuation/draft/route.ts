import { NextResponse } from "next/server";
import { ensureDraft, saveDraft } from "../../../lib/marketplace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { draft } = await ensureDraft();
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json({ draft: null, unavailable: true, error: error instanceof Error ? error.message : "Unable to load valuation draft." });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const draft = await saveDraft(body);
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json({ draft: null, unavailable: true, error: error instanceof Error ? error.message : "Unable to save valuation draft." });
  }
}
