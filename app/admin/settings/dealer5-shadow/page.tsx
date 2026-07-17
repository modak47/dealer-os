import Link from "next/link";
import { AdminPage } from "../../dashboard/page";
import { getDealer5ShadowHealth } from "@/lib/dealer5-shadow";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  matched: "Matched",
  status_conflict: "Status conflict",
  price_conflict: "Price conflict",
  missing_from_dealer5: "Missing from Dealer5",
  missing_from_yesmoto: "Missing from YesMoto",
  reserved_without_linked_deal: "Reserved without linked deal",
  sold_externally_active_internally: "Sold externally, active internally",
  needs_review: "Needs review",
};

export default async function Dealer5ShadowPage() {
  const data = await getDealer5ShadowHealth();
  return (
    <AdminPage title="Dealer5 Shadow Health" sub="Compare Dealer5 status against YesMoto before controlled shadow-mode testing.">
      {!data.migrationReady && (
        <div className="crm-setup">
          <b>Shadow-mode migration required</b>
          <span>Run 20260717000100_controlled_shadow_mode.sql in Supabase.</span>
        </div>
      )}

      <div className="crm-dashboard-strip">
        {Object.entries(labels).map(([key, label]) => (
          <article key={key}>
            <span>{label}</span>
            <strong>{data.counts[key] ?? 0}</strong>
          </article>
        ))}
      </div>

      <div className="table-wrap">
        <table className="admin-table crm-table">
          <thead>
            <tr>
              <th>Motorcycle</th>
              <th>YesMoto</th>
              <th>Dealer5</th>
              <th>Prices</th>
              <th>Images</th>
              <th>Last sync/change</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.stock_bike_id}>
                <td>
                  <b>{[row.make, row.model].filter(Boolean).join(" ") || "Motorcycle"}</b>
                  <small>{row.registration || row.stock_number || row.stock_bike_id}</small>
                </td>
                <td>{row.yesmoto_status || "-"}</td>
                <td>{row.dealer5_status || "-"}</td>
                <td>
                  YesMoto GBP {Number(row.yesmoto_price || 0).toLocaleString("en-GB")}
                  <small>Dealer5 GBP {Number(row.dealer5_price || 0).toLocaleString("en-GB")}</small>
                </td>
                <td>{row.yesmoto_image_count}</td>
                <td>
                  {row.dealer5_updated_at ? new Date(row.dealer5_updated_at).toLocaleString("en-GB") : "No Dealer5 sync"}
                  <small>{row.yesmoto_updated_at ? `YesMoto ${new Date(row.yesmoto_updated_at).toLocaleString("en-GB")}` : ""}</small>
                </td>
                <td>
                  <b>{labels[row.health_status] || row.health_status}</b>
                  <small>{row.has_active_reservation ? "Active reservation" : row.has_active_sale ? "Active sale" : ""}</small>
                </td>
                <td>
                  <Link className="crm-row-link" href={`/admin/stock/${row.stock_bike_id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.migrationReady && data.rows.length === 0 && (
          <div className="crm-empty">
            <b>No stock records to compare</b>
            <span>Dealer5 shadow health will populate from stock_bikes.</span>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
