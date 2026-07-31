#!/usr/bin/env node
import { createReadStream, createWriteStream } from "node:fs";
import { basename, resolve } from "node:path";
import { parse } from "csv-parse";
import { createClient } from "@supabase/supabase-js";

const args = new Map(process.argv.slice(2).map(arg => {
  const [key, ...rest] = arg.split("=");
  return [key.replace(/^--/, ""), rest.length ? rest.join("=") : "true"];
}));

const csvPath = args.get("file");
const dryRun = args.get("dry-run") !== "false";
const failureCsvPath = args.get("failures") || `airtable-website-leads-failures-${Date.now()}.csv`;

if (!csvPath) {
  console.error("Usage: node scripts/import-airtable-website-leads.mjs --file=/path/to/Website Leads.csv [--dry-run=false]");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
  console.error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when --dry-run=false.");
  process.exit(1);
}

const supabase = !dryRun ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const counts = { imported: 0, skipped: 0, duplicate: 0, failed: 0 };
const failureCsv = createWriteStream(resolve(failureCsvPath), { encoding: "utf8" });
failureCsv.write("reason,row\n");

const parser = createReadStream(resolve(csvPath)).pipe(parse({ columns: true, bom: true, relax_quotes: true, skip_empty_lines: true }));

for await (const row of parser) {
  try {
    const payload = mapAirtableRow(row);
    if (!payload.external_submission_id) {
      counts.skipped += 1;
      writeFailure("missing id", row);
      continue;
    }
    if (dryRun) {
      counts.imported += 1;
      continue;
    }
    const { error } = await supabase
      .from("website_leads")
      .upsert(payload, { onConflict: "lead_source,external_submission_id", ignoreDuplicates: true });
    if (error) throw error;
    counts.imported += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate/i.test(message)) counts.duplicate += 1;
    else counts.failed += 1;
    writeFailure(message, row);
  }
}

failureCsv.end();
console.log(JSON.stringify({ source: basename(csvPath), dryRun, counts, failureCsvPath: resolve(failureCsvPath) }, null, 2));

function mapAirtableRow(row) {
  const source = normaliseLegacySource(row.website);
  const date = parseDate(row.date);
  return {
    external_submission_id: `legacy-airtable-${clean(row.id)}`,
    lead_source: source,
    form_name: "Airtable Website Leads import",
    owner: clean(row.owner),
    reg: normaliseReg(row.reg),
    make: clean(row.make),
    model: clean(row.model),
    year: clean(row.year),
    engine: clean(row.engine),
    colour: clean(row.colour),
    mileage: clean(row.mileage),
    owners: clean(row.owners),
    spare_keys: clean(row.spare_keys),
    bike_condition: clean(row.bike_condition),
    damage: clean(row.damage),
    history: clean(row.history),
    service: clean(row.service),
    mot: clean(row.mot),
    extras: clean(row.extras),
    price: clean(row.price),
    fname: clean(row.fname),
    lname: clean(row.lname),
    email: clean(row.email)?.toLowerCase() ?? null,
    phone: clean(row.phone),
    postcode: normalisePostcode(row.postcode),
    image1: clean(row.image1),
    image2: clean(row.image2),
    image3: clean(row.image3),
    image4: clean(row.image4),
    image5: clean(row.image5),
    image6: clean(row.image6),
    image7: clean(row.image7),
    image8: clean(row.image8),
    image9: clean(row.image9),
    image10: clean(row.image10),
    website: clean(row.website),
    date,
    "Images": clean(row.Images),
    valuation_status: clean(row.valuation_status) || "pending",
    retail_estimate: money(row.retail_estimate),
    suggested_offer: money(row.suggested_offer),
    estimated_margin: money(row.estimated_margin),
    similar_bikes: clean(row.similar_bikes),
    auto_trader_search: clean(row.auto_trader_search),
    valuation_notes: clean(row.valuation_notes),
    "Motorway output": clean(row["Motorway output"]),
    status: "new",
    submitted_at: date,
    raw_payload: { source: "airtable_csv", row },
  };
}

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function money(value) {
  const text = clean(value);
  if (!text) return null;
  const number = Number(text.replace(/[£,\s]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function parseDate(value) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normaliseReg(value) {
  return clean(value)?.replace(/\s+/g, "").toUpperCase() ?? null;
}

function normalisePostcode(value) {
  const compact = clean(value)?.replace(/\s+/g, "").toUpperCase();
  if (!compact) return null;
  return compact.length > 3 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact;
}

function normaliseLegacySource(value) {
  const text = clean(value)?.toLowerCase().replace(/[\s-]+/g, "");
  if (text === "bikebuyeruk") return "bike_buyer_uk";
  if (text === "sellyourmotorbike") return "sell_your_motorbike";
  return text || "airtable";
}

function writeFailure(reason, row) {
  failureCsv.write(`${JSON.stringify(reason)},${JSON.stringify(JSON.stringify(row))}\n`);
}
