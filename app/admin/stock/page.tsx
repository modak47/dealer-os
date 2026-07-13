import { getSupabaseStockBikes } from "@/lib/supabase-stock";
import Link from "next/link";
import { AdminPage } from "../dashboard/page";
import { AdminStockTable, type StockFilter } from "./admin-stock-client";
export { Toggle } from "./admin-stock-client";

const filters=new Set(["active","live","reserved","sold","prep","all"]);
export default async function Stock({searchParams}:{searchParams:Promise<{filter?:string;q?:string;warning?:string}>}){
  const [result,params]=await Promise.all([getSupabaseStockBikes(),searchParams]);
  const filter=filters.has(params.filter??"")?params.filter as StockFilter:"active";
  return <AdminPage title="Stock management" sub="Manage inventory, pricing and advert data." actions={<div className="quick-actions"><Link href="/admin/stock/book-in" className="admin-primary">Book Into Stock</Link><Link href="/admin/stock/new">+ Add Advert</Link></div>}><AdminStockTable bikes={result.stock} initialFilter={filter} initialQuery={params.q??""} warning={params.warning??""}/></AdminPage>;
}
