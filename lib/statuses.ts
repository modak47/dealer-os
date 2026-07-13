export const STOCK_STATUS = {
  IN_STOCK: "In Stock",
  RESERVED: "Reserved",
  SALE_PENDING: "Sale Pending",
  SOLD: "Sold",
  SALE_COMPLETED: "Sale Completed",
  PURCHASE_PENDING: "Purchase Pending",
  PURCHASE_CANCELLED: "Purchase Cancelled",
} as const;

export const SALE_STATUS = {
  SALE_PENDING: "Sale Pending",
  SOLD: "Sold",
  SALE_COMPLETED: "Sale Completed",
  CANCELLED: "Cancelled",
  FINANCE: "Finance",
  AWAITING_PAYMENT: "Awaiting Payment",
  DELIVERY: "Delivery",
  COMPLETED_LEGACY: "Completed",
} as const;

export const ACTIVE_RESERVATION_STATUSES = ["Active", "Deposit Taken"] as const;
export const CLOSED_SALE_STATUSES = ["Cancelled", "Completed", "Sale Completed"] as const;
export const AVAILABLE_STOCK_STATUSES = ["In Stock", "On Forecourt", "Available", "Prep"] as const;

export function isAvailableStockStatus(status: unknown) {
  return AVAILABLE_STOCK_STATUSES.map(value => value.toLowerCase()).includes(String(status ?? "").toLowerCase());
}

export function isClosedSaleStatus(status: unknown) {
  return CLOSED_SALE_STATUSES.includes(String(status ?? "") as (typeof CLOSED_SALE_STATUSES)[number]);
}

export function lifecycleRank(status: unknown) {
  const value = String(status ?? "");
  if (value === STOCK_STATUS.SALE_COMPLETED || value === SALE_STATUS.COMPLETED_LEGACY) return 4;
  if (value === STOCK_STATUS.SOLD) return 3;
  if (value === STOCK_STATUS.SALE_PENDING) return 2;
  if (value === STOCK_STATUS.RESERVED) return 1;
  return 0;
}
