import "server-only";

import { normaliseRegistration } from "./text";

export type VehicleProviderResult = {
  registration: string;
  make?: string;
  model?: string;
  derivative?: string;
  year?: number;
  engineCapacity?: string | number;
  fuelType?: string;
  colour?: string;
  motExpiry?: string;
  motStatus?: string;
  previousOwners?: number;
  vehicleId?: string;
  lookupRaw: Record<string, unknown>;
  checkRaw: Record<string, unknown>;
  motTests?: unknown;
};

export type VehicleLookupErrorCode = "invalid_vrm" | "not_found" | "provider_unavailable" | "licensing_blocked";

export class VehicleLookupError extends Error {
  constructor(message: string, readonly code: VehicleLookupErrorCode, readonly status = 400) {
    super(message);
  }
}

export async function lookupByRegistration(registrationInput: string): Promise<VehicleProviderResult> {
  const registration = normaliseRegistration(registrationInput);
  if (!/^[A-Z0-9]{2,8}$/.test(registration)) throw new VehicleLookupError("Enter a valid UK motorcycle registration.", "invalid_vrm", 400);
  if (!hasAutotraderConfig()) {
    throw new VehicleLookupError("Vehicle lookup is not configured yet. You can still enter your motorcycle manually.", "provider_unavailable", 503);
  }

  const config = getAutotraderConfig();
  const token = await getAutotraderAccessToken(config);
  const params = new URLSearchParams({ advertiserId: config.advertiserId, registration, motTests: "true", history: "true", fullVehicleCheck: "true" });
  const response = await fetch(`${config.apiUrl}/vehicles?${params.toString()}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.status === 404) throw new VehicleLookupError("We could not find that registration. You can enter the motorcycle manually.", "not_found", 404);
  if (response.status === 403) throw new VehicleLookupError("The current Auto Trader agreement does not allow this vehicle lookup. Use manual entry for now.", "licensing_blocked", 403);
  if (!response.ok) throw new VehicleLookupError("Vehicle lookup is temporarily unavailable. Your progress is safe.", "provider_unavailable", 502);

  const vehicle = objectValue(payload.vehicle);
  if (!vehicle) throw new VehicleLookupError("We could not read a vehicle from that lookup. You can enter details manually.", "not_found", 404);
  const history = objectValue(vehicle.history) ?? objectValue(payload.history) ?? {};
  const check = objectValue(vehicle.check) ?? objectValue(payload.check) ?? {};
  return {
    registration,
    make: text(vehicle.make),
    model: text(vehicle.model),
    derivative: text(vehicle.derivative),
    year: number(vehicle.year) ?? yearFromDate(vehicle.firstRegistrationDate) ?? undefined,
    engineCapacity: text(vehicle.engineCapacityCC ?? vehicle.badgeEngineSizeCC ?? vehicle.badgeEngineSizeLitres),
    fuelType: text(vehicle.fuelType ?? vehicle.fuel),
    colour: text(vehicle.colour),
    motExpiry: findMotExpiry(vehicle, payload),
    motStatus: text(check.motStatus ?? vehicle.motStatus),
    previousOwners: number(vehicle.owners) ?? number(history.previousOwners) ?? undefined,
    vehicleId: text(vehicle.vehicleId ?? vehicle.vehicle_id ?? vehicle.id),
    lookupRaw: payload,
    checkRaw: check,
    motTests: vehicle.motTests ?? payload.motTests,
  };
}

function hasAutotraderConfig() {
  return Boolean(process.env.AUTOTRADER_API_KEY && process.env.AUTOTRADER_API_SECRET && process.env.AUTOTRADER_ADVERTISER_ID && process.env.AUTOTRADER_API_URL);
}

function getAutotraderConfig() {
  return {
    apiKey: process.env.AUTOTRADER_API_KEY as string,
    apiSecret: process.env.AUTOTRADER_API_SECRET as string,
    advertiserId: process.env.AUTOTRADER_ADVERTISER_ID as string,
    apiUrl: String(process.env.AUTOTRADER_API_URL).replace(/\/+$/, ""),
  };
}

let cachedToken: { token: string; expires: number } | null = null;

async function getAutotraderAccessToken(config: ReturnType<typeof getAutotraderConfig>) {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  const response = await fetch(`${config.apiUrl}/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ key: config.apiKey, secret: config.apiSecret }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; expires_at?: string };
  if (!response.ok || !payload.access_token || !payload.expires_at) throw new VehicleLookupError("Vehicle lookup authentication failed.", "provider_unavailable", 502);
  cachedToken = { token: payload.access_token, expires: Date.parse(payload.expires_at) };
  return payload.access_token;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function yearFromDate(value: unknown) {
  const match = text(value).match(/^(\d{4})-/);
  return match ? Number(match[1]) : undefined;
}

function findMotExpiry(vehicle: Record<string, unknown>, payload: Record<string, unknown>) {
  for (const value of [vehicle.motExpiry, vehicle.motExpiryDate, vehicle.motTestExpiryDate, payload.motExpiry, payload.motExpiryDate]) {
    const match = text(value).match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  return "";
}
