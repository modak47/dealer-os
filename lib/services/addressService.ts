import "server-only";

export interface AddressSuggestion {
  id: string;
  label: string;
}

export interface DealerAddress {
  buildingNumber: string;
  buildingName: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  town: string;
  county: string;
  postcode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string[];
}

export class AddressServiceError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
    this.name = "AddressServiceError";
  }
}

const cache = new Map<string, { expires: number; value: unknown }>();
const cacheTtl = 10 * 60 * 1000;

function getConfig() {
  const apiKey = process.env.GETADDRESS_API_KEY?.trim();
  const baseUrl = (process.env.GETADDRESS_BASE_URL || "https://api.getAddress.io").replace(/\/$/, "");

  if (!apiKey) {
    throw new AddressServiceError("Address lookup is not configured. Please enter the address manually.", 503);
  }

  return { apiKey, baseUrl };
}

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function providerMessage(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  return clean(record.Message) || clean(record.message) || clean(record.error);
}

async function getJson<T>(
  endpoint: string,
  cacheKey: string,
  additionalParams?: Record<string, string>,
): Promise<T> {
  const existing = cache.get(cacheKey);
  if (existing && existing.expires > Date.now()) return existing.value as T;

  const { apiKey, baseUrl } = getConfig();
  const url = new URL(`${baseUrl}${endpoint}`);
  url.searchParams.set("api-key", apiKey);
  Object.entries(additionalParams ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error("[GetAddress] Request failed before a response was received", {
      endpoint,
      keyConfigured: true,
      keyLength: apiKey.length,
      reason: error instanceof Error ? error.name : "Unknown error",
    });
    throw new AddressServiceError(
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "Address lookup timed out. Please try again or enter the address manually."
        : "Address lookup is temporarily unavailable. Please enter the address manually.",
      503,
    );
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  const message = providerMessage(body);
  const unauthorized = response.status === 401 || response.status === 403 || /unauthori[sz]ed/i.test(message);

  if (!response.ok || unauthorized) {
    console.error("[GetAddress] Provider rejected address request", {
      endpoint,
      status: response.status,
      keyConfigured: true,
      keyLength: apiKey.length,
      providerMessage: message || undefined,
    });

    if (unauthorized) {
      throw new AddressServiceError(
        "GetAddress API key is not authorised for address lookup. Check GetAddress account/API key.",
        503,
      );
    }
    if (response.status === 429) {
      throw new AddressServiceError(
        "Address lookup limit reached. Please wait a moment or enter the address manually.",
        429,
      );
    }
    if (response.status === 404) throw new AddressServiceError("No matching address was found.", 404);
    throw new AddressServiceError(
      "Address lookup is temporarily unavailable. Please enter the address manually.",
      response.status >= 400 && response.status < 600 ? response.status : 503,
    );
  }

  const value = body as T;
  cache.set(cacheKey, { expires: Date.now() + cacheTtl, value });
  return value;
}

export async function searchAddresses(term: string): Promise<AddressSuggestion[]> {
  const query = clean(term).slice(0, 160);
  if (query.length < 2) return [];

  // Produces exactly: /autocomplete/{term}?api-key={GETADDRESS_API_KEY}
  const result = await getJson<{ suggestions?: Array<{ id?: unknown; address?: unknown }> }>(
    `/autocomplete/${encodeURIComponent(query)}`,
    `search:${query.toLowerCase()}`,
  );

  return (result.suggestions ?? [])
    .map((item) => ({ id: clean(item.id), label: clean(item.address) }))
    .filter((item) => item.id && item.label);
}

export async function getAddress(id: string): Promise<DealerAddress> {
  const safeId = clean(id).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw new AddressServiceError("Invalid address selection.", 400);

  const item = await getJson<Record<string, unknown>>(
    `/get/${encodeURIComponent(safeId)}`,
    `address:${safeId}`,
  );
  const formatted = Array.isArray(item.formatted_address)
    ? item.formatted_address.map(clean).filter(Boolean)
    : [];

  return {
    buildingNumber: clean(item.building_number),
    buildingName: clean(item.building_name),
    addressLine1: clean(item.line_1) || formatted[0] || "",
    addressLine2: clean(item.line_2) || formatted[1] || "",
    addressLine3: clean(item.line_3) || formatted[2] || "",
    town: clean(item.town_or_city) || clean(item.locality),
    county: clean(item.county),
    postcode: clean(item.postcode).toUpperCase(),
    country: clean(item.country) || "United Kingdom",
    latitude: toNumber(item.latitude),
    longitude: toNumber(item.longitude),
    formattedAddress: formatted,
  };
}

export async function geocode(address: string): Promise<DealerAddress> {
  const suggestions = await searchAddresses(address);
  if (!suggestions[0]) throw new AddressServiceError("No matching address was found.", 404);
  return getAddress(suggestions[0].id);
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<DealerAddress> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new AddressServiceError("Invalid map coordinates.", 400);
  }

  const result = await getJson<{ suggestions?: Array<{ id?: unknown }> }>(
    `/nearest/${latitude}/${longitude}`,
    `reverse:${latitude.toFixed(5)}:${longitude.toFixed(5)}`,
    { top: "1" },
  );
  const id = clean(result.suggestions?.[0]?.id);
  if (!id) throw new AddressServiceError("No nearby address was found.", 404);
  return getAddress(id);
}
