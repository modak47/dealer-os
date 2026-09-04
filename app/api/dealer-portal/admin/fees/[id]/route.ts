import { NextResponse } from "next/server";
import { calculateFeeAmounts, nonNegativeMoney } from "@/lib/dealer-fees";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/website-leads";
import type { DealerPurchaseFee } from "@/types/dealer-portal";

export const dynamic = "force-dynamic";

type FeeAction = "mark_invoiced" | "record_payment" | "apply_credit" | "apply_adjustment" | "void";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffUser = await requireStaffUser();
  if (!staffUser) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 40) as FeeAction;
    if (!["mark_invoiced", "record_payment", "apply_credit", "apply_adjustment", "void"].includes(action)) return NextResponse.json({ error: "Unknown fee action." }, { status: 400 });

    const db = getSupabaseAdminClient();
    const currentResult = await db.from("dealer_purchase_fees").select("*").eq("id", id).maybeSingle();
    if (currentResult.error) return NextResponse.json({ error: "Unable to load Successful Purchase Fee." }, { status: 500 });
    if (!currentResult.data) return NextResponse.json({ error: "Successful Purchase Fee not found." }, { status: 404 });

    const current = currentResult.data as DealerPurchaseFee;
    if (current.status === "void" && action !== "void") return NextResponse.json({ error: "Voided Successful Purchase Fees cannot be changed." }, { status: 409 });

    const note = cleanText(body.note, 1000);
    const now = new Date().toISOString();
    const previousAmounts = feeLedgerAmounts(current);
    const updates = buildFeeUpdate(current, action, body, now, staffUser.id);
    const updatedResult = await db.from("dealer_purchase_fees").update(updates).eq("id", id).select("*").single();
    if (updatedResult.error) return NextResponse.json({ error: `Unable to update Successful Purchase Fee: ${updatedResult.error.message}` }, { status: 500 });

    const updated = updatedResult.data as DealerPurchaseFee;
    const amount = actionAmount(action, current, updated, body);
    const [ledgerInsert, auditInsert] = await Promise.all([
      db.from("dealer_fee_ledger_entries").insert({
        fee_id: updated.id,
        purchase_id: updated.purchase_id,
        website_lead_id: updated.website_lead_id,
        dealer_account_id: updated.dealer_account_id,
        entry_type: ledgerEntryType(action),
        amount,
        previous_status: current.status,
        new_status: updated.status,
        previous_amounts: previousAmounts,
        new_amounts: feeLedgerAmounts(updated),
        note,
        created_by: staffUser.id,
      }),
      db.from("dealer_portal_audit_events").insert({
        website_lead_id: updated.website_lead_id,
        dealer_account_id: updated.dealer_account_id,
        dealer_user_id: staffUser.id,
        event_type: `dealer_fee_${ledgerEntryType(action)}`,
        event_data: {
          fee_id: updated.id,
          purchase_id: updated.purchase_id,
          amount,
          previous_status: current.status,
          new_status: updated.status,
          previous_amounts: previousAmounts,
          new_amounts: feeLedgerAmounts(updated),
          note,
        },
      }),
    ]);
    const historyError = ledgerInsert.error || auditInsert.error;
    if (historyError) return NextResponse.json({ error: `Successful Purchase Fee was updated, but ledger history could not be recorded: ${historyError.message}` }, { status: 500 });
    return NextResponse.json({ fee: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Successful Purchase Fee." }, { status: 400 });
  }
}

function buildFeeUpdate(current: DealerPurchaseFee, action: FeeAction, body: Record<string, unknown>, now: string, staffUserId: string) {
  if (action === "void") return { status: "void", voided_at: now, voided_by: staffUserId, outstanding_amount: 0, notes: mergedNotes(current.notes, body.note) };

  if (action === "mark_invoiced") {
    const invoiceReference = cleanText(body.invoice_reference, 120);
    const amounts = calculateFeeAmounts({ ...current, invoiced_at: now });
    return {
      invoice_reference: invoiceReference || current.invoice_reference,
      invoiced_amount: amounts.effective_charge,
      paid_amount: amounts.paid_amount,
      outstanding_amount: amounts.outstanding_amount,
      invoiced_at: current.invoiced_at ?? now,
      invoiced_by: staffUserId,
      status: amounts.status,
      notes: mergedNotes(current.notes, body.note),
    };
  }

  const amount = nonNegativeMoney(body.amount);
  if (amount == null || amount <= 0) throw new Error("Amount must be greater than zero.");
  if (action === "record_payment") {
    const effective = Number(current.fee_amount ?? 0) + Number(current.adjustment_amount ?? 0) - Number(current.credit_amount ?? 0);
    const nextPaid = Number(current.paid_amount ?? 0) + amount;
    if (nextPaid > effective) throw new Error("Payment would exceed the effective Successful Purchase Fee charge. Dealer credit balances are not supported in V1.");
    const amounts = calculateFeeAmounts({ ...current, paid_amount: nextPaid });
    return { paid_amount: amounts.paid_amount, outstanding_amount: amounts.outstanding_amount, paid_at: amounts.outstanding_amount === 0 ? now : current.paid_at, paid_by: staffUserId, status: amounts.status, notes: mergedNotes(current.notes, body.note) };
  }
  if (action === "apply_credit") {
    const nextCredit = Number(current.credit_amount ?? 0) + amount;
    const effective = Number(current.fee_amount ?? 0) + Number(current.adjustment_amount ?? 0) - nextCredit;
    if (effective < 0 || effective < Number(current.paid_amount ?? 0)) throw new Error("Credit would create an unsupported dealer credit balance in V1.");
    const amounts = calculateFeeAmounts({ ...current, credit_amount: nextCredit });
    return { credit_amount: nextCredit, invoiced_amount: current.invoiced_at ? amounts.effective_charge : current.invoiced_amount, outstanding_amount: amounts.outstanding_amount, credited_at: now, status: amounts.status, notes: mergedNotes(current.notes, body.note) };
  }
  const nextAdjustment = Number(current.adjustment_amount ?? 0) + amount;
  const amounts = calculateFeeAmounts({ ...current, adjustment_amount: nextAdjustment });
  return { adjustment_amount: nextAdjustment, invoiced_amount: current.invoiced_at ? amounts.effective_charge : current.invoiced_amount, outstanding_amount: amounts.outstanding_amount, status: amounts.status, notes: mergedNotes(current.notes, body.note) };
}

function ledgerEntryType(action: FeeAction) {
  return action === "mark_invoiced" ? "marked_invoiced"
    : action === "record_payment" ? "payment_recorded"
      : action === "apply_credit" ? "credit_applied"
        : action === "apply_adjustment" ? "adjustment_applied"
          : "voided";
}

function actionAmount(action: FeeAction, previous: DealerPurchaseFee, next: DealerPurchaseFee, body: Record<string, unknown>) {
  if (action === "mark_invoiced") return Number(next.invoiced_amount ?? 0);
  if (action === "void") return Number(previous.outstanding_amount ?? 0);
  return nonNegativeMoney(body.amount) ?? 0;
}

function mergedNotes(existing: string | null, value: unknown) {
  const note = cleanText(value, 1000);
  if (!note) return existing;
  return [existing, note].filter(Boolean).join("\n");
}

function feeLedgerAmounts(fee: DealerPurchaseFee) {
  return {
    fee_amount: Number(fee.fee_amount ?? 0),
    credit_amount: Number(fee.credit_amount ?? 0),
    adjustment_amount: Number(fee.adjustment_amount ?? 0),
    invoiced_amount: Number(fee.invoiced_amount ?? 0),
    paid_amount: Number(fee.paid_amount ?? 0),
    outstanding_amount: Number(fee.outstanding_amount ?? 0),
  };
}
