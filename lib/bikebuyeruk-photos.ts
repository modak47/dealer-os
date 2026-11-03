import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validBikeBuyerCredential } from "./bikebuyeruk-leads";

export const photoBucket = "motorgeeks-seller-photos";
const maxBytes = 4 * 1024 * 1024;
const identity = z.object({
  lead_id: z.string().regex(/^[1-9]\d{0,14}$/),
  external_submission_id: z.string().max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/),
});
const manifestItem = z.strictObject({
  id: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byte_size: z.number().int().min(1).max(maxBytes),
  width: z.number().int().min(1).max(2048), height: z.number().int().min(1).max(2048),
});
const manifestRequest = identity.extend({ action: z.enum(["reserve", "complete"]), photos: z.array(manifestItem).min(1).max(10) }).strict();
type ManifestItem = z.infer<typeof manifestItem>;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
class PhotoError extends Error { constructor(public status: number, message: string) { super(message); } }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

async function readBytes(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) throw new PhotoError(413, "photo_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new PhotoError(400, "missing_body");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.byteLength;
    if (length > limit) { await reader.cancel(); throw new PhotoError(413, "photo_too_large"); }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}

export async function verifyPhoto(bytes: Buffer, expected: ManifestItem) {
  if (bytes.length !== expected.byte_size || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new PhotoError(409, "photo_conflict");
  try {
    const image = sharp(bytes, { limitInputPixels: 4194304, animated: false, failOn: "warning" });
    const meta = await image.metadata();
    if (meta.format !== "jpeg" || meta.width !== expected.width || meta.height !== expected.height || (meta.pages ?? 1) > 1 || meta.exif || meta.xmp || meta.iptc) throw new Error();
    // Decode every pixel; a valid header alone does not establish a valid image.
    await image.raw().toBuffer();
  } catch { throw new PhotoError(415, "invalid_photo"); }
}

/** Existing integration key only. No public Storage credentials or arbitrary URL fetches. */
export async function handleBikeBuyerPhotos(request: Request, options: { key?: string; enabled: boolean; database: () => SupabaseClient }) {
  if (!validBikeBuyerCredential(request.headers.get("authorization"), options.key)) return json({ error: "unauthorised" }, 401);
  if (!options.enabled) return json({ error: "photos_unavailable" }, 503);
  try {
    const db = options.database();
    if (request.method === "GET") {
      const check = await db.from("bikebuyeruk_photo_transfers").select("website_lead_id").limit(0);
      const bucket = await db.storage.getBucket(photoBucket);
      if (check.error || bucket.error || bucket.data?.public !== false) throw new Error("Storage unavailable");
      return json({ ok: true, integration: "bikebuyeruk_photos", version: 1, max_photos: 10, max_bytes: maxBytes, retention_days: 30 });
    }
    if (request.method === "POST") {
      if (request.headers.get("content-type") !== "application/json") throw new PhotoError(415, "unsupported_media_type");
      const body = manifestRequest.parse(JSON.parse((await readBytes(request, 8192)).toString("utf8")));
      if (new Set(body.photos.map(p => p.id)).size !== body.photos.length) throw new PhotoError(400, "duplicate_photo");
      const { data, error } = await db.rpc("bbuk_photo_transfer", { p_lead_id: body.lead_id, p_external_id: body.external_submission_id, p_action: body.action, p_photos: body.photos });
      if (error) throw new PhotoError(error.code === "PT409" ? 409 : error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503, "photo_transfer_unavailable");
      return json({ ok: true, lead_id: body.lead_id, external_submission_id: body.external_submission_id, ...data });
    }
    if (request.method === "PUT") {
      if (request.headers.get("content-type") !== "image/jpeg") throw new PhotoError(415, "unsupported_media_type");
      const who = identity.parse({ lead_id: request.headers.get("x-lead-id"), external_submission_id: request.headers.get("x-submission-id") });
      const id = z.uuid().parse(request.headers.get("x-photo-id"));
      const batch = await db.from("bikebuyeruk_photo_transfers").select("manifest,completed_at,removed_at").eq("website_lead_id", who.lead_id).eq("external_submission_id", who.external_submission_id).maybeSingle();
      if (batch.error) throw new Error();
      const expected = (batch.data?.manifest as ManifestItem[] | undefined)?.find(p => p.id === id);
      if (!expected || batch.data?.removed_at) throw new PhotoError(409, "photo_not_reserved");
      const bytes = await readBytes(request, maxBytes); await verifyPhoto(bytes, expected);
      if (batch.data?.completed_at) return json({ ok: true, photo_id: id, sha256: expected.sha256 });
      const path = `bike-buyer-uk/${who.lead_id}/${id}-${expected.sha256}.jpg`;
      const result = await db.storage.from(photoBucket).upload(path, bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
      if (result.error) {
        // A retry after a lost acknowledgement must verify the immutable object.
        const saved = await db.storage.from(photoBucket).download(path);
        if (saved.error || !saved.data || createHash("sha256").update(Buffer.from(await saved.data.arrayBuffer())).digest("hex") !== expected.sha256) throw new Error();
      }
      const ack = await db.rpc("bbuk_photo_transfer", { p_lead_id: who.lead_id, p_external_id: who.external_submission_id, p_action: "ack", p_photos: [expected] });
      if (ack.error) throw new Error();
      return json({ ok: true, photo_id: id, sha256: expected.sha256 });
    }
    if (request.method === "DELETE") {
      // Only completed BikeBuyer transfers, 30 days after the whole batch arrived.
      const expired = await db.from("bikebuyeruk_photo_transfers").select("website_lead_id,external_submission_id,manifest").lt("completed_at", new Date(Date.now() - 30 * 86400000).toISOString()).is("removed_at", null).limit(10);
      if (expired.error) throw new Error();
      let removed = 0;
      for (const batch of expired.data ?? []) {
        const paths = (batch.manifest as ManifestItem[]).map(p => `bike-buyer-uk/${batch.website_lead_id}/${p.id}-${p.sha256}.jpg`);
        const deleted = await db.storage.from(photoBucket).remove(paths); if (deleted.error) throw new Error();
        const ack = await db.rpc("bbuk_photo_transfer", { p_lead_id: batch.website_lead_id, p_external_id: batch.external_submission_id, p_action: "expire", p_photos: batch.manifest });
        if (ack.error) throw new Error(); removed += paths.length;
      }
      return json({ ok: true, removed });
    }
    return json({ error: "method_not_allowed" }, 405);
  } catch (error) {
    return json({ error: error instanceof PhotoError ? error.message : "photo_transfer_unavailable" }, error instanceof PhotoError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503);
  }
}
