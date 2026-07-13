import Link from "next/link";
import { AdminPage } from "../dashboard/page";
import { getFinancialLedger, ledgerMoney } from "@/lib/financial-ledger";

export const dynamic = "force-dynamic";

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; direction?: string; category?: string; q?: string }> }) {
  const params = await searchParams;
  const data = await getFinancialLedger(params);
  const categories = Array.from(new Set(data.rows.map(row => row.category))).sort();

  return <AdminPage title="Financial Ledger" sub="Posted income, expenses, stock purchases, costs, payments and sale-completion revenue." actions={<Link className="admin-primary" href="/admin/stock/book-in">Book Into Stock</Link>}>
    {!data.migrationReady && <div className="crm-setup"><b>Financial ledger migration required</b><span>Run 20260713000100_financial_foundation_and_stock_booking.sql in Supabase.</span></div>}
    <div className="crm-kpis">
      <article><span>Total income</span><strong>{ledgerMoney(data.kpis.income)}</strong></article>
      <article><span>Total expenses</span><strong>{ledgerMoney(data.kpis.expenses)}</strong></article>
      <article><span>Net cash movement</span><strong>{ledgerMoney(data.kpis.net)}</strong></article>
      <article><span>Sales revenue</span><strong>{ledgerMoney(data.kpis.salesRevenue)}</strong></article>
      <article><span>Stock purchases</span><strong>{ledgerMoney(data.kpis.stockPurchases)}</strong></article>
      <article><span>Stock costs</span><strong>{ledgerMoney(data.kpis.stockCosts)}</strong></article>
      <article><span>Refunds</span><strong>{ledgerMoney(data.kpis.refunds)}</strong></article>
      <article><span>Rows shown</span><strong>{data.rows.length}</strong></article>
    </div>
    <form className="admin-filters" action="/admin/ledger">
      <input type="date" name="from" defaultValue={params.from ?? ""} />
      <input type="date" name="to" defaultValue={params.to ?? ""} />
      <select name="direction" defaultValue={params.direction ?? ""}><option value="">All directions</option><option value="income">Income</option><option value="expense">Expense</option></select>
      <select name="category" defaultValue={params.category ?? ""}><option value="">All categories</option>{categories.map(category => <option key={category}>{category}</option>)}</select>
      <input name="q" defaultValue={params.q ?? ""} placeholder="Search bike, customer, reference..." />
      <button>Filter</button>
    </form>
    <div className="table-wrap">
      <table className="crm-table">
        <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Linked record</th><th>Method</th><th>Income</th><th>Expense</th><th>Status</th></tr></thead>
        <tbody>{data.rows.map(row => {
          const bike = [row.bike?.stock_number, row.bike?.registration, row.bike?.make, row.bike?.model].filter(Boolean).join(" ");
          const party = row.customer ? [row.customer.first_name, row.customer.last_name].filter(Boolean).join(" ") : row.supplier?.company_name || row.supplier?.name || "";
          return <tr key={row.id}>
            <td>{formatDate(row.transaction_date)}</td>
            <td><b>{row.transaction_type}</b><small>{row.category}</small></td>
            <td>{row.description}<small>{party}</small></td>
            <td>{row.stock_bike_id ? <Link className="crm-row-link" href={`/admin/stock/${row.stock_bike_id}`}>{bike || `Stock ${row.stock_bike_id}`}</Link> : "-"}<small>{row.invoice?.invoice_number || row.reference || row.source_id}</small></td>
            <td>{row.payment_method || "-"}</td>
            <td>{row.direction === "income" ? ledgerMoney(row.amount_pence) : "-"}</td>
            <td>{row.direction === "expense" ? ledgerMoney(row.amount_pence) : "-"}</td>
            <td>{row.status}</td>
          </tr>;
        })}</tbody>
      </table>
      {data.migrationReady && !data.rows.length && <div className="crm-empty"><b>No ledger entries found.</b><span>Post purchases, costs, payments or completed sales to populate the ledger.</span></div>}
    </div>
  </AdminPage>;
}

function formatDate(value: string) {
  return value ? new Intl.DateTimeFormat("en-GB").format(new Date(value)) : "-";
}
