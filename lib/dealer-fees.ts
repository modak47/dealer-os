import type { DealerPurchaseFee } from "@/types/dealer-portal";

export const dealerFeeLedgerEntryTypes = [
  "fee_created",
  "marked_invoiced",
  "payment_recorded",
  "credit_applied",
  "adjustment_applied",
  "voided",
] as const;

export type DealerFeeLedgerEntryType = typeof dealerFeeLedgerEntryTypes[number];

export type DealerFeeNumbers = Pick<DealerPurchaseFee, "fee_amount" | "credit_amount" | "adjustment_amount" | "paid_amount">;

export function moneyNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

export function nonNegativeMoney(value: unknown) {
  const number = moneyNumber(value);
  return number == null ? null : Math.max(0, number);
}

export function effectiveCharge(fee: Pick<DealerFeeNumbers, "fee_amount" | "credit_amount" | "adjustment_amount">) {
  return roundMoney(Number(fee.fee_amount ?? 0) + Number(fee.adjustment_amount ?? 0) - Number(fee.credit_amount ?? 0));
}

export function outstandingAmount(fee: DealerFeeNumbers) {
  return Math.max(0, roundMoney(effectiveCharge(fee) - Number(fee.paid_amount ?? 0)));
}

export function derivedFeeStatus(fee: DealerFeeNumbers & Pick<DealerPurchaseFee, "status" | "invoiced_at">): DealerPurchaseFee["status"] {
  if (fee.status === "void") return "void";
  const effective = effectiveCharge(fee);
  if (effective === 0 && Number(fee.credit_amount ?? 0) > 0) return "credited";
  if (fee.invoiced_at && outstandingAmount(fee) === 0) return "paid";
  if (fee.invoiced_at) return "invoiced";
  return "pending_invoice";
}

export function assertNonNegativeEffectiveCharge(fee: Pick<DealerFeeNumbers, "fee_amount" | "credit_amount" | "adjustment_amount">) {
  const effective = effectiveCharge(fee);
  if (effective < 0) throw new Error("Credit would make this Successful Purchase Fee negative. Dealer credit balances are not supported in V1.");
}

export function calculateFeeAmounts(fee: DealerFeeNumbers & Partial<Pick<DealerPurchaseFee, "status" | "invoiced_at">>) {
  assertNonNegativeEffectiveCharge(fee);
  const effective = effectiveCharge(fee);
  const paid = Math.min(Number(fee.paid_amount ?? 0), effective);
  return {
    effective_charge: effective,
    paid_amount: roundMoney(paid),
    outstanding_amount: Math.max(0, roundMoney(effective - paid)),
    status: derivedFeeStatus({ ...fee, paid_amount: paid, status: fee.status ?? "pending_invoice", invoiced_at: fee.invoiced_at ?? null }),
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
