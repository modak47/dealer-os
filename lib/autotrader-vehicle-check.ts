export type VehicleCheckSummary = {
  status: string;
  clear: boolean | null;
  category: string;
  outstandingFinance: boolean | null;
  privateFinance: boolean | null;
  tradeFinance: boolean | null;
  mileageDiscrepancy: boolean | null;
  highRisk: boolean | null;
  stolen: boolean | null;
  scrapped: boolean | null;
  exported: boolean | null;
  imported: boolean | null;
  writtenOff: boolean | null;
  colourChanged: boolean | null;
  plateChanges: number | null;
  previousOwners: number | null;
  motExpiry: string;
  motStatus: string;
  reportUrl: string;
  raw: Record<string, unknown>;
};

export function normaliseVehicleCheck(input: unknown, fallback: Partial<VehicleCheckSummary> = {}): VehicleCheckSummary {
  const raw = objectValue(input) ?? {};
  const flat = flattenScalars(raw);
  const category = firstText(flat, ["hpiCategory", "writeOffCategory", "insuranceWriteoffCategory", "insuranceWriteOffCategory", "insuranceWriteOff", "category", "categoryId"]);
  const privateFinance = firstBoolean(flat, ["privateFinance"]);
  const tradeFinance = firstBoolean(flat, ["tradeFinance"]);
  const outstandingFinance = firstBoolean(flat, ["outstandingFinance", "financeOutstanding", "hasOutstandingFinance", "finance"]) ?? financeFromArrays(raw) ?? (privateFinance === true || tradeFinance === true ? true : privateFinance === false && tradeFinance === false ? false : null);
  const mileageDiscrepancy = firstBoolean(flat, ["mileageDiscrepancy", "mileageDiscrepancyMarker"]);
  const highRisk = firstBoolean(flat, ["highRisk", "highRiskMarker"]);
  const stolen = firstBoolean(flat, ["stolen", "stolenMarker", "policeStolen", "isStolen"]);
  const scrapped = firstBoolean(flat, ["scrapped", "scrappedMarker", "isScrapped"]);
  const exported = firstBoolean(flat, ["exported", "exportMarker", "isExported"]);
  const imported = firstBoolean(flat, ["imported", "importMarker", "isImported"]);
  const writtenOff = firstBoolean(flat, ["writtenOff", "writeOff", "insuranceWriteOff", "insuranceWriteoff", "isWrittenOff"]) ?? (category ? true : null);
  const colourChanged = firstBoolean(flat, ["colourChanged", "colourChange", "colourChangeMarker"]);
  const plateChanges = firstNumber(flat, ["plateChanges", "plateChangeCount", "numberOfPlateChanges"]) ?? countArray(raw.plateChanges);
  const previousOwners = firstNumber(flat, ["previousOwners", "keepers", "keeperChanges", "owners"]) ?? fallback.previousOwners ?? null;
  const motExpiry = firstDate(flat, ["motExpiry", "motExpiryDate", "motTestExpiryDate", "lastMOTExpiry", "latestMotExpiryDate"]) || fallback.motExpiry || "";
  const motStatus = firstText(flat, ["motStatus", "mot.status"]) || (motExpiry ? "MOT date returned" : "");
  const reportUrl = firstText(flat, ["report", "reportUrl", "vehicleCheckReport"]);
  const explicitStatus = firstText(flat, ["hpiStatus", "vehicleCheckStatus", "checkStatus", "status", "result"]);
  const riskFlags = [outstandingFinance, stolen, scrapped, exported, writtenOff, mileageDiscrepancy, highRisk];
  const requiredClearFlags = [outstandingFinance, stolen, scrapped, exported, imported, writtenOff, mileageDiscrepancy, highRisk];
  const clear = category
    ? false
    : riskFlags.some(value => value === true)
      ? false
      : explicitClear(explicitStatus) ?? (requiredClearFlags.every(value => value === false) ? true : null);

  return {
    status: category ? `Category ${category}` : explicitStatus || (clear === true ? "Clear" : clear === false ? "Requires review" : reportUrl ? "Review report" : "Vehicle check returned"),
    clear,
    category,
    outstandingFinance,
    privateFinance,
    tradeFinance,
    mileageDiscrepancy,
    highRisk,
    stolen,
    scrapped,
    exported,
    imported,
    writtenOff,
    colourChanged,
    plateChanges,
    previousOwners,
    motExpiry,
    motStatus,
    reportUrl,
    raw,
  };
}

export function vehicleCheckFieldRows(check?: VehicleCheckSummary | null) {
  if (!check) return [];
  return [
    ["HPI / vehicle check", check.status],
    ["Clear", yesNoUnknown(check.clear)],
    ["Write-off category", check.category || "-"],
    ["Outstanding finance", yesNoUnknown(check.outstandingFinance)],
    ["Private finance", yesNoUnknown(check.privateFinance)],
    ["Trade finance", yesNoUnknown(check.tradeFinance)],
    ["Mileage discrepancy", yesNoUnknown(check.mileageDiscrepancy)],
    ["High risk marker", yesNoUnknown(check.highRisk)],
    ["Stolen marker", yesNoUnknown(check.stolen)],
    ["Scrapped marker", yesNoUnknown(check.scrapped)],
    ["Exported marker", yesNoUnknown(check.exported)],
    ["Imported marker", yesNoUnknown(check.imported)],
    ["Written off", yesNoUnknown(check.writtenOff)],
    ["Colour changed", yesNoUnknown(check.colourChanged)],
    ["Plate changes", check.plateChanges == null ? "-" : String(check.plateChanges)],
    ["Previous owners", check.previousOwners == null ? "-" : String(check.previousOwners)],
    ["MOT status", check.motStatus || "-"],
    ["MOT expiry", check.motExpiry || "-"],
    ["Report", check.reportUrl ? "Available" : "-"],
  ].map(([label, value]) => ({ label, value }));
}

function yesNoUnknown(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "-";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function countArray(value: unknown) {
  return Array.isArray(value) ? value.length : null;
}

function financeFromArrays(raw: Record<string, unknown>) {
  if (Array.isArray(raw.financeAgreements)) return raw.financeAgreements.length > 0;
  return null;
}

function flattenScalars(value: unknown, prefix = "", output: Record<string, unknown> = {}) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (prefix) output[prefix] = value;
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenScalars(item, prefix ? `${prefix}.${index}` : String(index), output));
    return output;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flattenScalars(child, prefix ? `${prefix}.${key}` : key, output);
    }
  }
  return output;
}

function firstText(flat: Record<string, unknown>, names: string[]) {
  for (const value of matchingValues(flat, names)) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
  }
  return "";
}

function firstBoolean(flat: Record<string, unknown>, names: string[]) {
  for (const value of matchingValues(flat, names)) {
    const parsed = parseBoolean(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstNumber(flat: Record<string, unknown>, names: string[]) {
  for (const value of matchingValues(flat, names)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstDate(flat: Record<string, unknown>, names: string[]) {
  for (const value of matchingValues(flat, names)) {
    if (typeof value !== "string") continue;
    const match = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  return "";
}

function matchingValues(flat: Record<string, unknown>, names: string[]) {
  const wanted = names.map(normaliseKey);
  return Object.entries(flat)
    .filter(([key]) => wanted.some(name => normaliseKey(key).endsWith(name)))
    .map(([, value]) => value);
}

function normaliseKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (["true", "yes", "y", "1", "present", "recorded", "fail", "failed"].includes(text)) return true;
  if (["false", "no", "n", "0", "none", "clear", "notrecorded", "not recorded", "pass", "passed"].includes(text)) return false;
  return null;
}

function explicitClear(status: string) {
  const value = status.toLowerCase();
  if (!value) return null;
  if (/\b(clear|passed|pass|no adverse|no marker)\b/.test(value)) return true;
  if (/\b(category|write|stolen|scrap|finance|fail|failed|marker|adverse)\b/.test(value)) return false;
  return null;
}
