import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSignedAttachmentUrl, stockDocumentsBucket } from "@/lib/stock-attachments";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data, error } = await getSupabaseAdmin().from("stock_attachments").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    const signedUrl = await createSignedAttachmentUrl(data.file_path);
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error("Attachment download failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to open attachment." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("stock_attachments").select("file_path").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    const removed = await db.storage.from(stockDocumentsBucket).remove([data.file_path]);
    if (removed.error) console.warn("Storage file removal failed", removed.error.message);
    const deleted = await db.from("stock_attachments").delete().eq("id", id);
    if (deleted.error) throw deleted.error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Attachment delete failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to delete attachment." }, { status: 500 });
  }
}
