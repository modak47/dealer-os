import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { ensureDraft, photoBucket } from "../../../lib/marketplace";
import { getSupabaseAdmin } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

const allowed = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
]);
const maxFiles = 20;
const maxBytes = 15 * 1024 * 1024;

export async function GET() {
  try {
    const { draft } = await ensureDraft();
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("lead_photos")
      .select("*")
      .eq("draft_id", draft.id)
      .neq("status", "removed")
      .order("sort_order", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const photos = [];
    for (const photo of data ?? []) {
      const signed = await db.storage.from(photo.storage_bucket).createSignedUrl(photo.storage_path, 60 * 15);
      photos.push({ ...photo, preview_url: signed.data?.signedUrl ?? null });
    }
    return NextResponse.json({ photos });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load photos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { draft } = await ensureDraft();
    const formData = await request.formData();
    const files = formData.getAll("photos").filter((item): item is File => item instanceof File);
    if (!files.length) return NextResponse.json({ error: "Choose at least one photo." }, { status: 400 });
    const db = getSupabaseAdmin();
    const existing = await db.from("lead_photos").select("id").eq("draft_id", draft.id).neq("status", "removed");
    const existingCount = existing.data?.length ?? 0;
    if (existingCount + files.length > maxFiles) return NextResponse.json({ error: `You can upload up to ${maxFiles} photos.` }, { status: 400 });

    const uploaded = [];
    for (const [index, file] of files.entries()) {
      const extension = allowed.get(file.type);
      if (!extension) return NextResponse.json({ error: `${file.name} is not a supported image type.` }, { status: 400 });
      if (file.size > maxBytes) return NextResponse.json({ error: `${file.name} is larger than 15MB.` }, { status: 400 });
      const path = `${draft.id}/${randomUUID()}.${extension}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const upload = await db.storage.from(photoBucket).upload(path, buffer, { contentType: file.type, upsert: false });
      if (upload.error) return NextResponse.json({ error: `Upload failed for ${file.name}: ${upload.error.message}` }, { status: 500 });
      const row = await db.from("lead_photos").insert({
        draft_id: draft.id,
        storage_bucket: photoBucket,
        storage_path: path,
        original_filename: file.name,
        content_type: file.type,
        byte_size: file.size,
        sort_order: existingCount + index,
      }).select("*").single();
      if (row.error) return NextResponse.json({ error: row.error.message }, { status: 500 });
      const signed = await db.storage.from(photoBucket).createSignedUrl(path, 60 * 15);
      uploaded.push({ ...row.data, preview_url: signed.data?.signedUrl ?? null });
    }
    await db.from("seller_valuation_drafts").update({ photo_count: existingCount + uploaded.length }).eq("id", draft.id);
    return NextResponse.json({ photos: uploaded });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to upload photos." }, { status: 500 });
  }
}
