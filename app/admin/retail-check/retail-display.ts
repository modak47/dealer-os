export function retailOfferFigures(retail: unknown, offer: string): { profit: number | null; margin: string | null } {
  const marketRetail = Number(retail);
  const offerPrice = Number(offer);
  if (retail === null || retail === undefined || String(retail).trim() === "" || offer.trim() === "" || !Number.isFinite(marketRetail) || !Number.isFinite(offerPrice)) {
    return { profit: null, margin: null };
  }
  const profit = marketRetail - offerPrice;
  return { profit, margin: marketRetail > 0 ? ((profit / marketRetail) * 100).toFixed(1) : null };
}
