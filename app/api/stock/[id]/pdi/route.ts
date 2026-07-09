import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { buildPdiPdf } from "@/lib/stock-pdi";
import { defaultPdiChecklist, type PdiChecklistItem } from "@/lib/stock-pdi-types";
import { stockDocumentPath, stockDocumentsBucket } from "@/lib/stock-attachments";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data, error } = await getSupabaseAdmin().from("stock_pdi_checks").select("*").eq("stock_bike_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error && !["42P01", "PGRST205"].includes(error.code)) throw error;
    return NextResponse.json({ pdi: data || { stock_bike_id: id, status: "draft", checklist: defaultPdiChecklist } });
  } catch (error) {
    console.error("Unable to load PDI", error);
    return NextResponse.json({ error: "Unable to load PDI." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as { checklist?: PdiChecklistItem[]; technicianName?: string; signatureDataUrl?: string };
    const checklist = Array.isArray(body.checklist) ? body.checklist : defaultPdiChecklist;
    const technicianName = String(body.technicianName || "").trim();
    const signatureDataUrl = String(body.signatureDataUrl || "");
    if (!technicianName) return NextResponse.json({ error: "Technician name is required." }, { status: 400 });
    if (!signatureDataUrl.startsWith("data:image/png;base64,")) return NextResponse.json({ error: "Technician signature is required." }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data: bike, error: bikeError } = await db.from("stock_bikes").select("*").eq("id", id).maybeSingle();
    if (bikeError) throw bikeError;
    if (!bike) return NextResponse.json({ error: "Stock bike not found." }, { status: 404 });

    const supabase = await createClient();
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const pdfBytes = await buildPdiPdf(bike as SupabaseStockBike, { checklist, technicianName, signatureDataUrl });
    const fileName = `PDI-${bike.registration || bike.id}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const filePath = stockDocumentPath(id, fileName);
    const upload = await db.storage.from(stockDocumentsBucket).upload(filePath, Buffer.from(pdfBytes), { contentType: "application/pdf", upsert: false });
    if (upload.error) throw upload.error;

    const attachment = await db.from("stock_attachments").insert({
      stock_bike_id: id,
      attachment_type: "PDI Form",
      file_name: fileName,
      file_path: filePath,
      content_type: "application/pdf",
      file_size: pdfBytes.length,
      notes: "Generated digital PDI form",
      uploaded_by: user?.id || null,
    }).select("*").single();
    if (attachment.error) throw attachment.error;

    const saved = await db.from("stock_pdi_checks").insert({
      stock_bike_id: id,
      checklist,
      technician_name: technicianName,
      technician_signature: signatureDataUrl,
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: user?.id || null,
      generated_attachment_id: attachment.data.id,
    }).select("*").single();
    if (saved.error) throw saved.error;

    await db.from("stock_bikes").update({ workshop_status: "PDI complete" }).eq("id", id);
    await db.from("stock_workflow_tasks").update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null }).eq("stock_bike_id", id).eq("department", "Workshop Preparation");

    return NextResponse.json({ pdi: saved.data, attachment: attachment.data });
  } catch (error) {
    console.error("Unable to complete PDI", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete PDI." }, { status: 500 });
  }
}
