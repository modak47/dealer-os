type LocationLike = {
  latitude?: number | null;
  longitude?: number | null;
  location_display_name?: string | null;
  location_town?: string | null;
  normalised_postcode?: string | null;
  postcode?: string | null;
  distance_from_yesmoto_miles?: number | null;
  estimated_drive_minutes?: number | null;
  geocoding_status?: string | null;
  location_lookup_error?: string | null;
};

type MapLocation = {
  latitude?: number | null;
  longitude?: number | null;
  postcode?: string | null;
  normalised_postcode?: string | null;
  location_display_name?: string | null;
  location_town?: string | null;
};

export function formatMiles(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} miles` : "Not available";
}

export function formatDriveMinutes(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not available";
  if (value < 60) return `${Math.round(value)} minutes`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

export function leadLocationTitle(lead: LocationLike) {
  return lead.location_display_name || [lead.location_town, lead.normalised_postcode || lead.postcode].filter(Boolean).join(", ") || "Location";
}

export function leadLocationStatus(lead: LocationLike) {
  if (lead.geocoding_status === "failed") return lead.location_lookup_error || "Location could not be resolved";
  if (lead.geocoding_status === "missing") return "Location not supplied";
  if (lead.geocoding_status === "partial") return lead.location_lookup_error || "Partial location only";
  if (lead.latitude != null && lead.longitude != null) return "Resolved";
  return lead.postcode || lead.normalised_postcode ? "Location lookup required" : "Location not supplied";
}

export function googleMapsUrl(location: MapLocation) {
  const query = location.latitude != null && location.longitude != null
    ? `${location.latitude},${location.longitude}`
    : [location.normalised_postcode || location.postcode, location.location_display_name, location.location_town].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || "YesMoto")}`;
}

export function directionsUrl(origin: string, location: MapLocation) {
  const destination = location.latitude != null && location.longitude != null
    ? `${location.latitude},${location.longitude}`
    : [location.normalised_postcode || location.postcode, location.location_display_name, location.location_town].filter(Boolean).join(", ");
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination || "YesMoto");
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

export function staticMapUrl(location: MapLocation) {
  const query = location.latitude != null && location.longitude != null
    ? `${location.latitude},${location.longitude}`
    : [location.normalised_postcode || location.postcode, location.location_display_name, location.location_town].filter(Boolean).join(", ");
  return query ? `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=10&output=embed` : null;
}
