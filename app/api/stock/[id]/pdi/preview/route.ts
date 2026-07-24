import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { buildPdiPdf } from "@/lib/stock-pdi";
import { defaultPdiChecklist, type PdiChecklistItem } from "@/lib/stock-pdi-types";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as { checklist?: PdiChecklistItem[]; technicianName?: string; signatureDataUrl?: string; customerName?: string; customerSignatureDataUrl?: string };
    const checklist = Array.isArray(body.checklist) ? body.checklist : defaultPdiChecklist;
    const db = getSupabaseAdmin();
    const { data: bike, error } = await db.from("stock_bikes").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!bike) return NextResponse.json({ error: "Stock bike not found." }, { status: 404 });

    const pdfBytes = await buildPdiPdf(bike as SupabaseStockBike, {
      checklist,
      technicianName: String(body.technicianName || "").trim(),
      signatureDataUrl: String(body.signatureDataUrl || ""),
      customerName: String(body.customerName || "").trim(),
      customerSignatureDataUrl: String(body.customerSignatureDataUrl || ""),
      completionConfirmed: false,
    });
    const fileName = `PDI-${bike.registration || bike.id}-preview.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Unable to preview PDI", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to preview PDI." }, { status: 500 });
  }
}
