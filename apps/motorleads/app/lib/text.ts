export function cleanText(value: unknown, max = 2000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ").slice(0, max);
}

export function normaliseRegistration(value: unknown) {
  return cleanText(value, 12).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function normalisePostcode(value: unknown) {
  const raw = cleanText(value, 30).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return match ? `${match[1]} ${match[2]}` : raw;
}

export function isValidPostcode(value: unknown) {
  return /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i.test(cleanText(value, 30));
}

export function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function poundsToPence(value: unknown) {
  const amount = numberOrNull(value);
  return amount == null ? null : Math.round(amount * 100);
}

export function formatRegistration(value: unknown) {
  const vrm = normaliseRegistration(value);
  return vrm.length > 3 ? `${vrm.slice(0, -3)} ${vrm.slice(-3)}` : vrm;
}
