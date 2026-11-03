// Server only. Node.js 20+; no dependencies. Never import into browser code.
export class DealerOsError extends Error {
  constructor(message, { status = 0, code = "network_error", fields = [], retryAfterSeconds = 30 } = {}) {
    super(message);
    this.name = "DealerOsError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryable = status === 0 || status === 429 || status >= 500;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Persist payload once in your CMS/outbox before calling. Retries must reuse
// that exact payload, especially external_submission_id and submitted_at.
export async function sendToDealerOs(payload, { dryRun = false } = {}) {
  const endpoint = process.env.DEALEROS_BIKEBUYERUK_LEADS_URL;
  const key = process.env.BIKEBUYERUK_LEADS_API_KEY;
  if (!endpoint || !key || key.length < 32) throw new Error("Configure DealerOS server environment variables first.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/integrations/bikebuyeruk/leads") {
    throw new Error("Use the supplied HTTPS DealerOS endpoint.");
  }
  let response;
  try {
    response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, dry_run: dryRun }) });
  } catch { throw new DealerOsError("DealerOS connection failed; retain this submission for retry."); }
  let result;
  try { result = await response.json(); }
  catch { throw new DealerOsError("DealerOS returned an unreadable response; retain this submission for retry."); }
  if (!response.ok) throw new DealerOsError(result.error || "DealerOS rejected this submission.", {
    status: response.status, code: result.code, fields: result.fields,
    retryAfterSeconds: Number(response.headers.get("Retry-After")) || 30,
  });
  const saved = [200, 201].includes(response.status) && result.ok === true && result.lead?.id != null;
  const validated = response.status === 200 && result.ok === true && result.dry_run === true;
  if (!(dryRun ? validated : saved)) throw new DealerOsError("DealerOS did not confirm this submission; retain it for retry.");
  return result;
}

// Prefill only. Ask the seller to confirm the result and supply mileage,
// contact details and consent before sendToDealerOs creates a Website Lead.
export async function lookupDealerOsVrm(registration, { dryRun = false } = {}) {
  const endpoint = process.env.DEALEROS_BIKEBUYERUK_VRM_URL;
  const key = process.env.BIKEBUYERUK_LEADS_API_KEY;
  if (!endpoint || !key || key.length < 32) throw new Error("Configure DealerOS server environment variables first.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/integrations/bikebuyeruk/vrm-lookup") {
    throw new Error("Use the supplied HTTPS DealerOS VRM endpoint.");
  }
  let response;
  try {
    response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(25_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ registration, dry_run: dryRun }) });
  } catch { throw new DealerOsError("Registration lookup is unavailable. Offer manual entry."); }
  let result;
  try { result = await response.json(); }
  catch { throw new DealerOsError("Registration lookup returned an unreadable response. Offer manual entry."); }
  if (!response.ok) throw new DealerOsError(result.error || "Registration lookup is unavailable. Offer manual entry.", {
    status: response.status, code: result.code,
    retryAfterSeconds: Number(response.headers.get("Retry-After")) || 60,
  });
  if (response.status !== 200 || result.ok !== true || !(dryRun ? result.dry_run === true : typeof result.vehicle?.reg === "string")) {
    throw new DealerOsError("Registration lookup did not return a usable result. Offer manual entry.");
  }
  return result;
}
