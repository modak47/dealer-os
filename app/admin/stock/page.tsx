import { getSupabaseStockBikes, toAdminStockBike } from "@/lib/supabase-stock";
import Link from "next/link";
import { AdminPage } from "../dashboard/page";
import { AdminStockTable, type StockFilter } from "./admin-stock-client";
export { Toggle } from "./admin-stock-client";

const filters=new Set(["active","live","reserved","sold","prep","all"]);
export default async function Stock({searchParams}:{searchParams:Promise<{filter?:string;q?:string;warning?:string}>}){
  const [result,params]=await Promise.all([getSupabaseStockBikes(),searchParams]);
  const bikes=result.stock.map(toAdminStockBike);
  const filter=filters.has(params.filter??"")?params.filter as StockFilter:"active";
  return <AdminPage title="Stock management" sub="Manage inventory and publishing status." actions={<Link href="/admin/stock?filter=all" className="admin-primary">+ Add stock</Link>}><AdminStockTable bikes={bikes} initialFilter={filter} initialQuery={params.q??""} warning={params.warning??""}/></AdminPage>;
}
