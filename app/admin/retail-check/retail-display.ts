import { formatAdvertMoney } from "../opportunities/opportunity-utils";

export function retailComparableValues(details: string): string[] {
  const parts = details.split("|").map(value => value.trim());
  const available = (value: string | undefined) => value && !/^(none|null|unknown|n\/a|-)$/i.test(value) ? value : "—";
  const mileage = parts[2]?.match(/^([\d,]+)\s*(?:miles?|mi)?$/i);
  const mileageLabel = mileage ? `${Number(mileage[1].replaceAll(",", "")).toLocaleString("en-GB")} miles` : available(parts[2]);
  return [
    formatAdvertMoney(parts[0]?.replace(/^GBP\s*/i, ""), "Not available"),
    available(parts[1]),
    mileageLabel,
    available(parts[3]),
    available(parts[4]?.replace(/^DOM\s*:?\s*/i, "")),
  ];
}

export function retailOfferFigures(retail: unknown, offer: string): { profit: number | null; margin: string | null } {
  const marketRetail = Number(retail);
  const offerPrice = Number(offer);
  if (retail === null || retail === undefined || String(retail).trim() === "" || offer.trim() === "" || !Number.isFinite(marketRetail) || !Number.isFinite(offerPrice)) {
    return { profit: null, margin: null };
  }
  const profit = marketRetail - offerPrice;
  return { profit, margin: marketRetail > 0 ? ((profit / marketRetail) * 100).toFixed(1) : null };
}
