import "server-only";

import { dealerAddress, getDealerSettings } from "@/lib/dealer-settings";
import { AddressServiceError, geocode } from "@/lib/services/addressService";

export type Coordinates = { latitude: number; longitude: number };

export type LocationLookupInput = {
  address?: string | null;
  postcode?: string | null;
  town?: string | null;
};

export type LocationResult = {
  normalisedPostcode: string | null;
  latitude: number | null;
  longitude: number | null;
  displayName: string | null;
  town: string | null;
  status: "resolved" | "partial" | "failed" | "missing";
  provider: string | null;
  checkedAt: string;
  error: string | null;
  distanceFromYesMotoMiles: number | null;
  estimatedDriveMinutes: number | null;
};

type PostcodesIoResult = {
  status?: number;
  result?: {
    postcode?: string;
    latitude?: number;
    longitude?: number;
    admin_district?: string;
    parish?: string;
  } | null;
  error?: string;
};

const fullPostcodePattern = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;

export function cleanLocationText(value: unknown, max = 1000) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : null;
}

export function normaliseUKPostcode(value: string | null | undefined) {
  const cleaned = cleanLocationText(value, 30)?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  const match = cleaned.match(fullPostcodePattern);
  return match ? `${match[1]} ${match[2]}` : cleaned || null;
}

export function isFullUKPostcode(value: string | null | undefined) {
  const postcode = normaliseUKPostcode(value);
  return Boolean(postcode && fullPostcodePattern.test(postcode));
}

export function validateCoordinates(latitude: unknown, longitude: unknown): Coordinates | null {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function haversineMiles(a: Coordinates, b: Coordinates) {
  const radiusMiles = 3958.7613;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(radiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}

export function googleMapsLocationUrl(input: LocationLookupInput & Partial<Coordinates>) {
  const coords = validateCoordinates(input.latitude, input.longitude);
  const query = coords ? `${coords.latitude},${coords.longitude}` : [input.address, normaliseUKPostcode(input.postcode), input.town].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || "YesMoto")}`;
}

export function googleMapsDirectionsUrl(origin: string | Coordinates, destination: LocationLookupInput & Partial<Coordinates>) {
  const originValue = typeof origin === "string" ? origin : `${origin.latitude},${origin.longitude}`;
  const coords = validateCoordinates(destination.latitude, destination.longitude);
  const destinationValue = coords ? `${coords.latitude},${coords.longitude}` : [destination.address, normaliseUKPostcode(destination.postcode), destination.town].filter(Boolean).join(", ");
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", originValue);
  url.searchParams.set("destination", destinationValue || "YesMoto");
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

export async function getYesMotoLocation() {
  const settings = await getDealerSettings();
  const address = cleanLocationText(process.env.YESMOTO_ADDRESS, 300) || dealerAddress(settings);
  const postcode = normaliseUKPostcode(process.env.YESMOTO_POSTCODE || settings.postcode);
  const configured = validateCoordinates(process.env.YESMOTO_LATITUDE, process.env.YESMOTO_LONGITUDE);
  if (configured) return { address, postcode, ...configured };
  if (postcode && isFullUKPostcode(postcode)) {
    const postcodeResult = await lookupPostcode(postcode);
    if (postcodeResult.latitude !== null && postcodeResult.longitude !== null) return { address, postcode, latitude: postcodeResult.latitude, longitude: postcodeResult.longitude };
  }
  throw new Error("YesMoto location is not configured. Add YESMOTO_LATITUDE and YESMOTO_LONGITUDE or a valid dealer postcode.");
}

export async function lookupLeadLocation(input: LocationLookupInput): Promise<LocationResult> {
  const checkedAt = new Date().toISOString();
  const postcode = normaliseUKPostcode(input.postcode);
  const address = cleanLocationText(input.address, 1000);
  const town = cleanLocationText(input.town, 120);
  if (!address && !postcode && !town) return { ...emptyResult("missing", "Location not supplied.", checkedAt, postcode, town), distanceFromYesMotoMiles: null, estimatedDriveMinutes: null };

  let resolved: Omit<LocationResult, "distanceFromYesMotoMiles" | "estimatedDriveMinutes"> | null = null;
  if (address) {
    try {
      const addressResult = await geocode([address, postcode].filter(Boolean).join(", "));
      const coords = validateCoordinates(addressResult.latitude, addressResult.longitude);
      if (coords) {
        resolved = {
          normalisedPostcode: normaliseUKPostcode(addressResult.postcode) || postcode,
          latitude: coords.latitude,
          longitude: coords.longitude,
          displayName: [addressResult.town, normaliseUKPostcode(addressResult.postcode) || postcode].filter(Boolean).join(", ") || address,
          town: cleanLocationText(addressResult.town, 120) || town,
          status: "resolved",
          provider: "getaddress",
          checkedAt,
          error: null,
        };
      }
    } catch (error) {
      if (!(error instanceof AddressServiceError) || error.status !== 503) {
        resolved = emptyResult("failed", error instanceof Error ? error.message : "Address not found.", checkedAt, postcode, town);
      }
    }
  }

  if (!resolved && postcode && isFullUKPostcode(postcode)) resolved = await lookupPostcode(postcode, checkedAt);
  if (!resolved && town) resolved = emptyResult("partial", "Only a town or locality is available. Add a postcode for distance and directions.", checkedAt, postcode, town);
  if (!resolved) resolved = emptyResult("failed", postcode ? "Invalid or unresolved UK postcode." : "Location could not be resolved.", checkedAt, postcode, town);

  const coords = validateCoordinates(resolved.latitude, resolved.longitude);
  let distanceFromYesMotoMiles: number | null = null;
  if (coords) {
    try {
      const yesMoto = await getYesMotoLocation();
      distanceFromYesMotoMiles = haversineMiles({ latitude: yesMoto.latitude, longitude: yesMoto.longitude }, coords);
    } catch (error) {
      return { ...resolved, status: "failed", error: error instanceof Error ? error.message : "YesMoto location is not configured.", distanceFromYesMotoMiles: null, estimatedDriveMinutes: null };
    }
  }
  return { ...resolved, distanceFromYesMotoMiles, estimatedDriveMinutes: null };
}

async function lookupPostcode(postcode: string, checkedAt = new Date().toISOString()): Promise<Omit<LocationResult, "distanceFromYesMotoMiles" | "estimatedDriveMinutes">> {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  } catch (error) {
    return emptyResult("failed", error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "Postcode lookup timed out." : "Postcode lookup service unavailable.", checkedAt, postcode, null, "postcodes.io");
  }
  const body = await response.json().catch(() => null) as PostcodesIoResult | null;
  if (!response.ok || !body?.result) {
    return emptyResult("failed", response.status === 404 ? "Postcode not found." : body?.error || "Postcode lookup failed.", checkedAt, postcode, null, "postcodes.io");
  }
  const coords = validateCoordinates(body.result.latitude, body.result.longitude);
  if (!coords) return emptyResult("failed", "Postcode lookup returned invalid coordinates.", checkedAt, postcode, null, "postcodes.io");
  const normalisedPostcode = normaliseUKPostcode(body.result.postcode || postcode);
  const town = cleanLocationText(body.result.admin_district || body.result.parish, 120);
  return {
    normalisedPostcode,
    latitude: coords.latitude,
    longitude: coords.longitude,
    displayName: [town, normalisedPostcode].filter(Boolean).join(", "),
    town,
    status: "resolved",
    provider: "postcodes.io",
    checkedAt,
    error: null,
  };
}

function emptyResult(status: LocationResult["status"], error: string | null, checkedAt: string, postcode: string | null, town: string | null, provider: string | null = null): Omit<LocationResult, "distanceFromYesMotoMiles" | "estimatedDriveMinutes"> {
  return { normalisedPostcode: postcode, latitude: null, longitude: null, displayName: town || postcode, town, status, provider, checkedAt, error };
}

export function leadLocationUpdate(result: LocationResult) {
  return {
    normalised_postcode: result.normalisedPostcode,
    latitude: result.latitude,
    longitude: result.longitude,
    location_display_name: result.displayName,
    location_town: result.town,
    geocoding_status: result.status,
    geocoding_provider: result.provider,
    location_checked_at: result.checkedAt,
    location_lookup_error: result.error,
    distance_from_yesmoto_miles: result.distanceFromYesMotoMiles,
    estimated_drive_minutes: result.estimatedDriveMinutes,
  };
}

export function stockLocationUpdate(result: LocationResult, address: string | null, collectionNotes?: string | null) {
  return {
    collection_address: address,
    collection_postcode: result.normalisedPostcode,
    collection_latitude: result.latitude,
    collection_longitude: result.longitude,
    collection_location_display_name: result.displayName,
    collection_location_checked_at: result.checkedAt,
    collection_location_error: result.error,
    distance_from_yesmoto_miles: result.distanceFromYesMotoMiles,
    estimated_drive_minutes: result.estimatedDriveMinutes,
    collection_notes: collectionNotes,
  };
}
