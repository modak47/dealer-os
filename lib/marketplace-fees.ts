export type MarketplaceFeeBand = {
  id?: string;
  min_purchase_price: number;
  max_purchase_price: number | null;
  fee_amount: number;
  sort_order?: number;
};

export function marketplaceFeeForPrice(price: number, bands: MarketplaceFeeBand[]) {
  if (!Number.isFinite(price) || price < 0) return null;
  const band = [...bands]
    .sort((left, right) => left.min_purchase_price - right.min_purchase_price)
    .find(item => price >= item.min_purchase_price && (item.max_purchase_price === null || price < item.max_purchase_price));
  return band ? Number(band.fee_amount) : null;
}

export function validateMarketplaceFeeBands(input: MarketplaceFeeBand[]) {
  if (!Array.isArray(input) || input.length === 0) return "At least one fee band is required.";
  const bands = [...input].sort((left, right) => Number(left.min_purchase_price) - Number(right.min_purchase_price));
  if (Number(bands[0].min_purchase_price) !== 0) return "The first fee band must start at £0.";
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const min = Number(band.min_purchase_price);
    const max = band.max_purchase_price === null ? null : Number(band.max_purchase_price);
    const fee = Number(band.fee_amount);
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(fee) || fee < 0 || (max !== null && (!Number.isFinite(max) || max <= min))) {
      return `Fee band ${index + 1} has invalid values.`;
    }
    if (index < bands.length - 1) {
      if (max === null) return "Only the final fee band can have no upper limit.";
      if (max !== Number(bands[index + 1].min_purchase_price)) return "Fee bands must be continuous and must not overlap or leave gaps.";
    } else if (max !== null) {
      return "The final fee band must have no upper limit.";
    }
  }
  return null;
}
