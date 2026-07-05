import { NextResponse } from "next/server";
import type { StockApiResponse } from "@/lib/stock-bike-types";
import { getSupabaseStockBikes } from "@/lib/supabase-stock";

export async function GET(){
  const result=await getSupabaseStockBikes();
  return NextResponse.json<StockApiResponse>(result,{status:result.error&&result.configured?500:200});
}
