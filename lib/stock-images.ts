const placeholderPattern = /(?:^|\/)(?:bike-placeholder|placeholder|no-image|no_image)(?:\.|\/|$)|coming.?soon|awaiting.?prep|awaiting.?preparation|logo|yesmoto-logo|staff-login|finance.?banner|warranty.?banner|reserve.?online/i;

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function imageKey(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.toLowerCase().replace("/w200/", "/");
  } catch {
    return value.trim().toLowerCase().split("?")[0].replace("/w200/", "/");
  }
}

function extractImageValues(value: unknown, output: string[]) {
  if (value == null) return;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return;
    if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
      try {
        extractImageValues(JSON.parse(raw), output);
        return;
      } catch {
        // Fall through and treat it as plain text.
      }
    }
    raw.split(/[\n,]+/).map(item => item.trim()).filter(Boolean).forEach(item => output.push(item));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => extractImageValues(item, output));
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["url", "src", "href", "secure_url", "image_url", "primary_image_url"]) {
      const candidate = text(record[key]);
      if (candidate) output.push(candidate);
    }
    for (const key of ["thumbnails", "large", "full", "original", "attachments", "images"]) {
      if (record[key] !== undefined) extractImageValues(record[key], output);
    }
  }
}

export function isUsableStockImageUrl(value: unknown) {
  const raw = text(value);
  if (!raw || placeholderPattern.test(raw)) return false;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    return !placeholderPattern.test(`${url.hostname}${url.pathname}`);
  } catch {
    return false;
  }
}

export function normalizeStockImageUrls(...values: unknown[]) {
  const raw: string[] = [];
  values.forEach(value => extractImageValues(value, raw));
  const seen = new Set<string>();
  return raw.filter(isUsableStockImageUrl).filter(value => {
    const key = imageKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function hasUsableStockImage(...values: unknown[]) {
  return normalizeStockImageUrls(...values).length > 0;
}

export function compareImageAvailability(aHasImage: boolean, bHasImage: boolean) {
  return Number(bHasImage) - Number(aHasImage);
}
