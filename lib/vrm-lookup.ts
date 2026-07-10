const MOTORWAY_VRM_URL = "https://api.motorway.co.uk/platform/vrm-check";

export type VrmLookupResult = Record<string, unknown>;

export function normaliseRegistration(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export async function lookupVrm(vrmInput: string): Promise<VrmLookupResult> {
  const vrm = normaliseRegistration(vrmInput);
  if (!vrm) throw new Error("Registration required");
  const response = await fetch(MOTORWAY_VRM_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: {}, vrm }), cache: "no-store" });
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json() as VrmLookupResult : { error: await response.text() || "Motorway returned an empty response." };
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data ? String(data.error) : `Vehicle lookup failed (${response.status}).`;
    throw new Error(message);
  }
  return data;
}

export function vehicleField(data: VrmLookupResult, field: "make" | "model" | "year"): string {
  const vehicle = data.vehicle && typeof data.vehicle === "object" ? data.vehicle as Record<string, unknown> : {};
  if (field === "make") {
    const make = vehicle.make;
    if (make && typeof make === "object") {
      const makeObject = make as Record<string, unknown>;
      return String(makeObject.display_name ?? makeObject.map_id ?? "");
    }
    return String(make ?? "");
  }
  if (field === "model") return String(vehicle.model ?? (vehicle.genericModel && typeof vehicle.genericModel === "object" ? (vehicle.genericModel as Record<string, unknown>).display_name ?? "" : "") ?? "");
  return String(vehicle.year ?? vehicle.manufactureYear ?? "");
}
