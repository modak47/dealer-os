const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, ".env");
const IMAGE_PATH = process.env.PINTEREST_IMAGE_PATH || path.join(ROOT, "pinterest-bike.jpg");
const LOGIN_STATE_PATH = process.env.PINTEREST_LOGIN_STATE || path.join(ROOT, "pinterest-login.json");
const BOARD_NAME = process.env.PINTEREST_BOARD_NAME || "Bike Stock";
const DRY_RUN = !process.argv.includes("--publish") && process.env.AUTO_PUBLISH !== "true";
const INCLUDE_DRAFTS = process.argv.includes("--include-drafts") || process.env.PINTEREST_INCLUDE_DRAFTS === "true";
const HEADLESS = process.argv.includes("--headed") ? false : process.env.PINTEREST_HEADLESS !== "false";
const WORKER_MODE = process.argv.includes("--worker") || process.env.PINTEREST_WORKER_MODE === "true";
const POLL_SECONDS = Number(process.env.PINTEREST_POSTER_POLL_SECONDS || "10");
const WORKER_ID = `${os.hostname()}-${process.pid}`;
let running = true;

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key.trim()]) process.env[key.trim()] = value;
  }
}

loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";

function requireConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in /home/yesmoto/dealerbot/.env");
  }
  if (!fs.existsSync(LOGIN_STATE_PATH)) {
    throw new Error(`Pinterest login state not found: ${LOGIN_STATE_PATH}`);
  }
}

function apiHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseGet(table, query) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: apiHeaders(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase GET ${table} failed: ${response.status} ${text}`);
  return text ? JSON.parse(text) : [];
}

async function supabasePatch(table, id, updates) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: apiHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(updates),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase PATCH ${table} failed: ${response.status} ${text}`);
  return text ? JSON.parse(text) : [];
}

async function supabasePatchByQuery(table, query, updates) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: apiHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(updates),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase PATCH ${table} failed: ${response.status} ${text}`);
  return text ? JSON.parse(text) : [];
}

function dueNow(row) {
  return !row.scheduled_for || new Date(row.scheduled_for).getTime() <= Date.now();
}

async function getNextQueuedPost() {
  const statuses = INCLUDE_DRAFTS ? "draft,approved,scheduled" : "approved,scheduled";
  const select = [
    "id",
    "stock_bike_id",
    "platform",
    "status",
    "caption",
    "image_url",
    "target_url",
    "scheduled_for",
    "metadata",
    "bike:stock_bikes(id,make,model,variant,year,mileage,price,registration,primary_image_url,image_urls,status)",
  ].join(",");
  const query = new URLSearchParams({
    select,
    platform: "eq.pinterest",
    status: `in.(${statuses})`,
    order: "scheduled_for.asc.nullsfirst,created_at.asc",
    limit: "10",
  });
  const rows = await supabaseGet("social_post_queue", query.toString());
  return rows.find(dueNow) || null;
}

async function claimQueuedPost(post) {
  if (DRY_RUN) return post;
  const query = new URLSearchParams({
    id: `eq.${post.id}`,
    status: "in.(approved,scheduled)",
  });
  const claimed = await supabasePatchByQuery("social_post_queue", query.toString(), {
    status: "posting",
    error: null,
    metadata: { ...(post.metadata || {}), pinterest_worker_id: WORKER_ID, pinterest_worker_started_at: new Date().toISOString() },
  });
  return claimed.length ? post : null;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function priceText(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return `GBP ${Math.round(number).toLocaleString("en-GB")}`;
}

function buildTitle(post) {
  const bike = post.bike || {};
  const bits = [bike.year, bike.make, bike.model, bike.variant].filter(Boolean);
  const base = cleanText(bits.join(" "));
  return base ? `${base} For Sale` : "Motorcycle For Sale at YesMoto";
}

function buildAltText(post) {
  const bike = post.bike || {};
  const title = cleanText([bike.year, bike.make, bike.model, bike.variant].filter(Boolean).join(" "));
  const mileage = bike.mileage ? `${Number(bike.mileage).toLocaleString("en-GB")} miles` : "";
  return cleanText(`${title || "Motorcycle"} photographed at YesMoto dealership. ${mileage} Finance and UK delivery available.`);
}

function imageUrlFromPost(post) {
  if (post.image_url) return post.image_url;
  const bike = post.bike || {};
  if (bike.primary_image_url) return bike.primary_image_url;
  if (Array.isArray(bike.image_urls) && bike.image_urls.length) return bike.image_urls[0];
  return "";
}

function targetUrlFromPost(post) {
  if (post.target_url) return post.target_url;
  return "https://yesmoto.co.uk/used-bikes";
}

async function downloadFile(url, destination) {
  if (!url) throw new Error("No image URL found on the queued post or stock bike.");
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const client = url.startsWith("https:") ? https : http;
  await new Promise((resolve, reject) => {
    const request = client.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadFile(response.headers.location, destination).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Image download failed: ${response.statusCode}`));
        return;
      }
      const writer = fs.createWriteStream(destination);
      response.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
    request.on("error", reject);
  });
}

async function fillPinterest(post) {
  const title = buildTitle(post);
  const caption = cleanText(post.caption);
  const targetUrl = targetUrlFromPost(post);
  const imageUrl = imageUrlFromPost(post);
  const altText = buildAltText(post);
  const bike = post.bike || {};

  console.log(`Preparing Pinterest post ${post.id}`);
  console.log(`${title}${bike.price ? ` - ${priceText(bike.price)}` : ""}`);
  console.log(`Image: ${imageUrl}`);
  console.log(`Link: ${targetUrl}`);

  await downloadFile(imageUrl, IMAGE_PATH);
  console.log(`Image downloaded to ${IMAGE_PATH}`);

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 250 });
  const context = await browser.newContext({ storageState: LOGIN_STATE_PATH });
  const page = await context.newPage();

  try {
    await page.goto("https://www.pinterest.com/pin-creation-tool/", { waitUntil: "domcontentloaded", timeout: 60000 });

    try {
      await page.click("text=Accept all", { timeout: 3000 });
      console.log("Cookies accepted");
    } catch {
      console.log("No cookie popup");
    }

    await page.locator('input[type="file"]').setInputFiles(IMAGE_PATH);
    console.log("Image uploaded");

    const titleInput = page.locator('input[placeholder="Add a title"], #storyboard-selector-title').first();
    await titleInput.waitFor({ state: "visible", timeout: 60000 });
    await titleInput.fill(title);
    console.log("Title added");

    const descriptionBox = page.locator('[contenteditable="true"]').first();
    await descriptionBox.click();
    await page.keyboard.type(caption);
    console.log("Description added");

    const linkInput = page.locator('input[placeholder="Add a link"]').first();
    await linkInput.fill(targetUrl);
    console.log("Website link added");

    try {
      await page.getByText("More options").click({ timeout: 8000 });
      await page.waitForTimeout(1000);
      await page.mouse.wheel(0, 3000);
      await page.locator(`input[placeholder="Describe your Pin's visual details"]`).fill(altText, { timeout: 8000 });
      console.log("Alt text added");
    } catch (error) {
      console.log(`Alt text skipped: ${error.message}`);
    }

    try {
      await page.getByText("Choose a board").click({ timeout: 10000 });
      await page.waitForTimeout(1000);
      await page.getByText(BOARD_NAME, { exact: true }).click({ timeout: 10000 });
      console.log(`Board selected: ${BOARD_NAME}`);
    } catch (error) {
      console.log(`Board selection skipped: ${error.message}`);
    }

    if (DRY_RUN) {
      console.log("Dry run complete. Pinterest has been filled, but Publish was not clicked.");
      await page.waitForTimeout(5000);
      return { posted: false, externalUrl: null };
    }

    const publishButton = page.getByRole("button", { name: "Publish" }).first();
    await publishButton.waitFor({ state: "visible", timeout: 30000 });
    await publishButton.click({ force: true });
    console.log("Publish clicked");
    await page.waitForTimeout(5000);
    return { posted: true, externalUrl: null };
  } finally {
    await browser.close();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runOnce() {
  requireConfig();

  const post = await getNextQueuedPost();
  if (!post) {
    console.log(`No due Pinterest posts found. ${INCLUDE_DRAFTS ? "Checked draft/approved/scheduled." : "Checked approved/scheduled only."}`);
    console.log("Tip: use --include-drafts for testing drafts queued from Dealer OS.");
    return false;
  }

  const claimedPost = await claimQueuedPost(post);
  if (!claimedPost) {
    console.log(`Post ${post.id} was already claimed by another worker.`);
    return true;
  }

  try {
    const result = await fillPinterest(claimedPost);
    if (DRY_RUN) return true;
    await supabasePatch("social_post_queue", claimedPost.id, {
      status: result.posted ? "posted" : post.status,
      posted_at: result.posted ? new Date().toISOString() : null,
      external_url: result.externalUrl,
      error: null,
      metadata: { ...(post.metadata || {}), pinterest_worker_id: WORKER_ID, pinterest_worker_finished_at: new Date().toISOString(), pinterest_board: BOARD_NAME },
    });
    console.log("Supabase queue updated");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (!DRY_RUN) {
      await supabasePatch("social_post_queue", claimedPost.id, {
        status: "failed",
        error: message,
        metadata: { ...(post.metadata || {}), pinterest_worker_id: WORKER_ID, pinterest_worker_failed_at: new Date().toISOString() },
      });
    }
    process.exitCode = 1;
    return true;
  }
}

async function workerLoop() {
  console.log(`YesMoto Pinterest poster worker started: ${WORKER_ID}`);
  console.log(`Polling every ${POLL_SECONDS}s. ${DRY_RUN ? "Dry run mode; Publish will not be clicked." : "Publish mode enabled."}`);

  while (running) {
    try {
      await runOnce();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
    if (running) await sleep(Math.max(POLL_SECONDS, 2) * 1000);
  }

  console.log("YesMoto Pinterest poster worker stopped.");
}

async function main() {
  if (WORKER_MODE) {
    await workerLoop();
    return;
  }
  await runOnce();
}

process.on("SIGTERM", () => {
  console.log("Shutdown requested; worker will stop after current post.");
  running = false;
});

process.on("SIGINT", () => {
  console.log("Shutdown requested; worker will stop after current post.");
  running = false;
});

main();
