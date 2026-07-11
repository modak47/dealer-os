import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getStockLedgerData, ledgerCsv, ledgerStatusSets } from "@/lib/stock-ledger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const url = new URL(request.url);
    const data = await getStockLedgerData();
    const exportType = url.searchParams.get("export");
    if (exportType) {
      const rows = exportType === "pending" ? data.rows.filter(row => row.status === ledgerStatusSets.pendingStatus)
        : exportType === "sold" ? data.rows.filter(row => ledgerStatusSets.soldStatuses.has(row.status))
        : exportType === "profit" ? data.rows.filter(row => ledgerStatusSets.soldStatuses.has(row.status) || ledgerStatusSets.activeStatuses.has(row.status))
        : data.rows.filter(row => ledgerStatusSets.activeStatuses.has(row.status));
      return new NextResponse(ledgerCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="yesmoto-${exportType}-stock-ledger.csv"` } });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load stock ledger." }, { status: 500 });
  }
}
