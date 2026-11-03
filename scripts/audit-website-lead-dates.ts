import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { analyseLeadDate } from "../lib/website-lead-date";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0,i), l.slice(i+1).trim().replace(/^['"]|['"]$/g, "")]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function main() {
  const formats: Record<string, number> = {}, samples: Record<string, unknown[]> = {};
  let total = 0, confident = 0, differentFromSubmitted = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("website_leads").select("id,date,submitted_at,created_at").order("id").range(offset, offset+999);
    if (error) throw error;
    for (const row of data ?? []) {
      const analysis = analyseLeadDate(row.date, row.submitted_at, row.created_at);
      total++; if (analysis.confident) confident++;
      if (Date.parse(analysis.received_at) !== Date.parse(row.submitted_at)) differentFromSubmitted++;
      formats[analysis.format] = (formats[analysis.format] ?? 0) + 1;
      samples[analysis.format] ??= [];
      if (samples[analysis.format].length < 4) samples[analysis.format].push({ id: row.id, original: row.date, submitted_at: row.submitted_at, ...analysis });
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  const report = { inspectedAt: new Date().toISOString(), total, confident, fallback: total-confident, differentFromSubmitted, formats, samples, policy: "Preserve date and submitted_at. Use new received_at; ambiguous/invalid dates retain submitted_at or created_at fallback, visibly labelled. No data changed." };
  mkdirSync("reports/website-leads", { recursive: true });
  writeFileSync("reports/website-leads/date-backfill.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ total, confident, fallback: total-confident, differentFromSubmitted, formats }));
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
