import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

loadLocalEnv();

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Number(limitArg?.split("=")[1] || 500);
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const select = "id,registration,make,model,status,primary_image_url,image_urls";

const rows = [];
let from = 0;
while (rows.length < limit) {
  const to = Math.min(from + 99, limit - 1);
  const { data, error } = await db.from("stock_bikes").select(select).range(from, to);
  if (error) throw error;
  if (!data?.length) break;
  rows.push(...data);
  from += data.length;
}

const broken = [];
for (const row of rows) {
  const images = Array.isArray(row.image_urls) ? row.image_urls.filter(Boolean) : [];
  if (!images.length) continue;
  const checked = await Promise.all(images.map(checkImage));
  const liveImages = images.filter((_, index) => checked[index].ok);
  if (liveImages.length === images.length) continue;
  broken.push({
    id: row.id,
    registration: row.registration,
    bike: [row.make, row.model].filter(Boolean).join(" ") || "Motorcycle",
    status: row.status,
    before: images.length,
    after: liveImages.length,
    firstFailure: checked.find((result) => !result.ok),
  });
  console.log(`${row.registration || row.id}: ${images.length} stored, ${liveImages.length} reachable`);
  if (apply) {
    const { error } = await db.from("stock_bikes").update({
      image_urls: liveImages,
      primary_image_url: liveImages[0] ?? null,
      photo_status: liveImages.length ? row.photo_status : "Unavailable",
    }).eq("id", row.id);
    if (error) throw error;
  }
}

console.log(JSON.stringify({ checked: rows.length, broken: broken.length, apply, rows: broken }, null, 2));

async function checkImage(imageUrl) {
  try {
    const response = await fetch(imageUrl, { method: "HEAD" });
    const type = response.headers.get("content-type") || "";
    return { ok: response.ok && type.startsWith("image/"), status: response.status, type, url: imageUrl };
  } catch (error) {
    return { ok: false, status: "error", type: "", url: imageUrl, error: error instanceof Error ? error.message : String(error) };
  }
}

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line || /^\s*#/.test(line) || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}
