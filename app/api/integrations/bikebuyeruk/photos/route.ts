import { handleBikeBuyerPhotos } from "@/lib/bikebuyeruk-photos";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const handle = (request: Request) => handleBikeBuyerPhotos(request, {
  key: process.env.BIKEBUYERUK_LEADS_API_KEY,
  enabled: process.env.BIKEBUYERUK_PHOTOS_ENABLED === "true",
  database: getSupabaseAdminClient,
});
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
