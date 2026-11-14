import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStockAttachments, isStockAttachmentType, stockDocumentPath, stockDocumentsBucket } from "@/lib/stock-attachments";
import { inactivePreparationReason } from "@/lib/preparation-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const stockBikeId = new URL(request.url).searchParams.get("stock_bike_id") || "";
  if (!stockBikeId) return NextResponse.json({ error: "stock_bike_id is required." }, { status: 400 });
  const result = await getStockAttachments(stockBikeId);
  return NextResponse.json(result, { status: result.error && result.migrationReady ? 500 : 200 });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const stockBikeId = String(form.get("stock_bike_id") || "").trim();
    const attachmentType = String(form.get("attachment_type") || "").trim();
    const notes = String(form.get("notes") || "").trim() || null;
    const workflowTaskId = String(form.get("workflow_task_id") || "").trim();
    const file = form.get("file");
    if (!stockBikeId) return NextResponse.json({ error: "stock_bike_id is required." }, { status: 400 });
    if (!isStockAttachmentType(attachmentType)) return NextResponse.json({ error: "Choose a valid attachment type." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF or image to upload." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const db = getSupabaseAdmin();
    if (workflowTaskId) {
      if (attachmentType !== "PDI Form") return NextResponse.json({ error: "Only a completed PDI can finish workshop preparation." }, { status: 400 });
      const task = await db.from("stock_workflow_tasks").select("stock_bike_id,department").eq("id", workflowTaskId).maybeSingle();
      if (task.error) throw task.error;
      if (!task.data || task.data.stock_bike_id !== stockBikeId || task.data.department !== "Workshop Preparation") return NextResponse.json({ error: "The PDI task does not belong to this stock bike." }, { status: 400 });
      const bike = await db.from("stock_bikes").select("status,is_test_record").eq("id", stockBikeId).maybeSingle();
      if (bike.error) throw bike.error;
      if (inactivePreparationReason(bike.data)) return NextResponse.json({ error: "This bike is no longer in active preparation." }, { status: 409 });
    }
    const filePath = stockDocumentPath(stockBikeId, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await db.storage.from(stockDocumentsBucket).upload(filePath, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upload.error) throw upload.error;

    const { data, error } = await db.from("stock_attachments").insert({
      stock_bike_id: stockBikeId,
      attachment_type: attachmentType,
      file_name: file.name,
      file_path: filePath,
      content_type: file.type || null,
      file_size: file.size,
      notes,
      uploaded_by: user?.id || null,
    }).select("*").single();
    if (error) throw error;

    if (attachmentType === "PDI Form") {
      const stock = await db.from("stock_bikes").update({ workshop_status: "PDI complete" }).eq("id", stockBikeId);
      if (stock.error) throw stock.error;
      const completed = await db.from("stock_workflow_tasks").update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null })
        .eq("stock_bike_id", stockBikeId).eq("department", "Workshop Preparation");
      if (completed.error) throw completed.error;
    }

    return NextResponse.json({ attachment: data }, { status: 201 });
  } catch (error) {
    console.error("Stock attachment upload failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to upload stock attachment." }, { status: 500 });
  }
}
