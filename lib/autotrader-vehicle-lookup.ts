import { autotraderFetch, getAutotraderConfig } from "@/lib/autotrader";
import { normaliseRegistration } from "@/lib/vrm-lookup";

export type DealerOsVehicle = {
  registration?: string;
  vin?: string;
  make?: string;
  model?: string;
  derivative?: string;
  derivativeId?: string;
  vehicleId?: string;
  year?: number;
  firstRegistrationDate?: string;
  mileage?: number;
  fuelType?: string;
  transmission?: string;
  engineSize?: number | string;
  bodyType?: string;
  colour?: string;
  doors?: number;
  seats?: number;
  power?: number | string;
  manufacturer?: string;
  modelRange?: string;
  generation?: string;
  vehicleType?: string;
  trim?: string;
  taxonomyData?: Record<string, unknown>;
};

type AutotraderVehicleResponse = {
  vehicle?: unknown;
  message?: unknown;
  error?: unknown;
};

export async function lookupVehicleByVrm(vrmInput: string): Promise<DealerOsVehicle> {
  const vrm = normaliseRegistration(vrmInput);
  if (!isValidVrm(vrm)) throw new AutotraderVehicleLookupError("Invalid VRM.", 400, "invalid_vrm");

  const config = getAutotraderConfig();
  const params = new URLSearchParams({ advertiserId: config.advertiserId, registration: vrm });
  const response = await autotraderFetch(`/vehicles?${params.toString()}`);
  const payload = await readJson<AutotraderVehicleResponse>(response);

  if (response.status === 404) throw new AutotraderVehicleLookupError("No vehicle found for that VRM.", 404, "not_found");
  if (response.status === 403) {
    throw new AutotraderVehicleLookupError(
      `Auto Trader Vehicle Taxonomy is unavailable for this advertiser or API key: ${errorMessage(payload, response.statusText)}`,
      403,
      "forbidden",
    );
  }
  if (!response.ok) {
    throw new AutotraderVehicleLookupError(`Auto Trader vehicle lookup failed (${response.status}): ${errorMessage(payload, response.statusText)}`, response.status, "autotrader_error");
  }

  const vehicle = objectValue(payload.vehicle);
  if (!vehicle) throw new AutotraderVehicleLookupError("Auto Trader did not return a vehicle object for that VRM.", 404, "not_found");
  return normaliseAutotraderVehicle(vehicle, payload);
}

export function normaliseAutotraderVehicle(vehicle: Record<string, unknown>, payload: Record<string, unknown> = { vehicle }): DealerOsVehicle {
  const result: DealerOsVehicle = {};
  setText(result, "registration", vehicle.registration);
  setText(result, "vin", vehicle.vin);
  setText(result, "make", vehicle.make);
  setText(result, "model", vehicle.model);
  setText(result, "derivative", vehicle.derivative);
  setText(result, "derivativeId", vehicle.derivativeId ?? vehicle.derivative_id);
  setText(result, "vehicleId", vehicle.vehicleId ?? vehicle.vehicle_id ?? vehicle.id);
  setNumber(result, "year", vehicle.year ?? yearFromDate(vehicle.firstRegistrationDate));
  setText(result, "firstRegistrationDate", vehicle.firstRegistrationDate);
  setNumber(result, "mileage", vehicle.mileage ?? vehicle.mileageLastMot);
  setText(result, "fuelType", vehicle.fuelType ?? vehicle.fuel);
  setText(result, "transmission", vehicle.transmissionType ?? vehicle.transmission);
  setValue(result, "engineSize", vehicle.engineCapacityCC ?? vehicle.badgeEngineSizeCC ?? vehicle.badgeEngineSizeLitres);
  setText(result, "bodyType", vehicle.bodyType ?? vehicle.style);
  setText(result, "colour", vehicle.colour);
  setNumber(result, "doors", vehicle.doors);
  setNumber(result, "seats", vehicle.seats);
  setValue(result, "power", vehicle.enginePowerBHP ?? vehicle.enginePowerPS);
  setText(result, "manufacturer", vehicle.manufacturer ?? objectText(vehicle.oem, "make"));
  setText(result, "modelRange", vehicle.modelRange);
  setText(result, "generation", vehicle.generation);
  setText(result, "vehicleType", vehicle.vehicleType);
  setText(result, "trim", vehicle.trim);
  result.taxonomyData = payload;
  return result;
}

export class AutotraderVehicleLookupError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

function isValidVrm(value: string) {
  return /^[A-Z0-9]{2,8}$/.test(value);
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

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function objectText(value: unknown, key: string) {
  const object = objectValue(value);
  return object ? text(object[key]) : "";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function number(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function yearFromDate(value: unknown) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-/);
  return match ? Number(match[1]) : null;
}

function setText(target: DealerOsVehicle, key: keyof DealerOsVehicle, value: unknown) {
  const next = text(value);
  if (next) (target as Record<string, unknown>)[key] = next;
}

function setNumber(target: DealerOsVehicle, key: keyof DealerOsVehicle, value: unknown) {
  const next = number(value);
  if (next !== null) (target as Record<string, unknown>)[key] = next;
}

function setValue(target: DealerOsVehicle, key: keyof DealerOsVehicle, value: unknown) {
  const nextText = text(value);
  const nextNumber = number(value);
  if (nextText) (target as Record<string, unknown>)[key] = nextNumber ?? nextText;
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
