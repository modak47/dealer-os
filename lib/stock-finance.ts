export type StockFinancialInput = {
  purchasePrice?: number | null;
  targetRetailPrice?: number | null;
  actualPurchasePrice?: number | null;
  actualSalePrice?: number | null;
  estimatedPreparationCost?: number | null;
  actualPreparationCost?: number | null;
  estimatedTransportCost?: number | null;
  actualTransportCost?: number | null;
  otherEstimatedCosts?: number | null;
  otherActualCosts?: number | null;
};

const n = (value: number | null | undefined) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function estimatedTotalCost(input: StockFinancialInput) {
  return n(input.purchasePrice) + n(input.estimatedPreparationCost) + n(input.estimatedTransportCost) + n(input.otherEstimatedCosts);
}

export function expectedProfit(input: StockFinancialInput) {
  return n(input.targetRetailPrice) - estimatedTotalCost(input);
}

export function actualTotalCost(input: StockFinancialInput) {
  return n(input.actualPurchasePrice ?? input.purchasePrice) + n(input.actualPreparationCost) + n(input.actualTransportCost) + n(input.otherActualCosts);
}

export function actualProfit(input: StockFinancialInput) {
  return n(input.actualSalePrice) - actualTotalCost(input);
}

export function formatStockMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(value));
}
