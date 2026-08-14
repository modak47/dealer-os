type AutotraderAuthResponse = {
  access_token?: unknown;
  expires_at?: unknown;
};

export type AutotraderAdvertiser = {
  advertiserId?: string;
  name?: string;
  status?: string;
  website?: string | null;
  phone?: string | null;
  [key: string]: unknown;
};

export type AutotraderConnectionTest = {
  ok: boolean;
  apiUrl: string;
  advertiserId: string;
  tokenExpiresAt: string;
  advertiser: AutotraderAdvertiser | null;
  advertAllowances: unknown;
  totalResults: number | null;
};

let cachedToken: { token: string; expiresAt: number; expiresAtIso: string } | null = null;

export function clearAutotraderTokenCache() {
  cachedToken = null;
}

export function getAutotraderConfig() {
  const apiKey = process.env.AUTOTRADER_API_KEY?.trim();
  const apiSecret = process.env.AUTOTRADER_API_SECRET?.trim();
  const advertiserId = process.env.AUTOTRADER_ADVERTISER_ID?.trim();
  const apiUrl = normaliseApiUrl(process.env.AUTOTRADER_API_URL || "https://api-sandbox.autotrader.co.uk");
  const missing = [
    ["AUTOTRADER_API_KEY", apiKey],
    ["AUTOTRADER_API_SECRET", apiSecret],
    ["AUTOTRADER_ADVERTISER_ID", advertiserId],
    ["AUTOTRADER_API_URL", apiUrl],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Auto Trader Connect is not configured. Missing: ${missing.join(", ")}`);
  }

  return {
    apiKey: apiKey as string,
    apiSecret: apiSecret as string,
    advertiserId: advertiserId as string,
    apiUrl,
  };
}

export function hasAutotraderConfig() {
  return Boolean(
    process.env.AUTOTRADER_API_KEY?.trim() &&
      process.env.AUTOTRADER_API_SECRET?.trim() &&
      process.env.AUTOTRADER_ADVERTISER_ID?.trim() &&
      process.env.AUTOTRADER_API_URL?.trim(),
  );
}

export async function getAutotraderAccessToken({ forceRefresh = false } = {}) {
  const config = getAutotraderConfig();
  const refreshBufferMs = 60_000;
  if (!forceRefresh && cachedToken && cachedToken.expiresAt - refreshBufferMs > Date.now()) {
    return { accessToken: cachedToken.token, expiresAt: cachedToken.expiresAtIso };
  }

  const body = new URLSearchParams({ key: config.apiKey, secret: config.apiSecret });
  const response = await fetch(`${config.apiUrl}/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const payload = await readJson<AutotraderAuthResponse>(response);

  if (!response.ok) {
    cachedToken = null;
    throw new Error(`Auto Trader authentication failed (${response.status}): ${errorMessage(payload, response.statusText)}`);
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const expiresAtIso = typeof payload.expires_at === "string" ? payload.expires_at : "";
  const expiresAt = Date.parse(expiresAtIso);
  if (!accessToken || !Number.isFinite(expiresAt)) {
    cachedToken = null;
    throw new Error("Auto Trader authentication response did not include a usable access token and expiry.");
  }

  cachedToken = { token: accessToken, expiresAt, expiresAtIso };
  return { accessToken, expiresAt: expiresAtIso };
}

export async function autotraderFetch(path: string, init: RequestInit = {}, retryOnUnauthorised = true) {
  const config = getAutotraderConfig();
  const { accessToken } = await getAutotraderAccessToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (response.status === 401 && retryOnUnauthorised) {
    cachedToken = null;
    await getAutotraderAccessToken({ forceRefresh: true });
    return autotraderFetch(path, init, false);
  }

  return response;
}

export async function testAutotraderConnection(): Promise<AutotraderConnectionTest> {
  const config = getAutotraderConfig();
  const token = await getAutotraderAccessToken();
  const params = new URLSearchParams({ advertiserId: config.advertiserId, autotraderAdvertAllowances: "true" });
  const response = await autotraderFetch(`/advertisers?${params.toString()}`);
  const payload = await readJson<{ results?: AutotraderAdvertiser[]; totalResults?: number; message?: string }>(response);

  if (!response.ok) {
    throw new Error(`Auto Trader advertiser check failed (${response.status}): ${errorMessage(payload, response.statusText)}`);
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  return {
    ok: true,
    apiUrl: config.apiUrl,
    advertiserId: config.advertiserId,
    tokenExpiresAt: token.expiresAt,
    advertiser: results[0] ?? null,
    advertAllowances: results[0]?.autotraderAdvertAllowances ?? null,
    totalResults: typeof payload.totalResults === "number" ? payload.totalResults : null,
  };
}

function normaliseApiUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { message: text.slice(0, 500) } as T;
  }
}

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "title"]) {
      if (typeof record[key] === "string" && record[key]) return record[key];
    }
  }
  return fallback || "Request failed";
}
