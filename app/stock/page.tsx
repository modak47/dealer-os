import type { Metadata } from "next";
import { getPublicStockBikes } from "@/lib/stock";
import { StockPageClient } from "./stock-page-client";

export const metadata:Metadata={title:"Stock",description:"Browse YesMoto motorcycle stock."};
export const revalidate=60;
export default async function StockPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){const [bikes,query]=await Promise.all([getPublicStockBikes(),searchParams]);return <StockPageClient bikes={bikes} initial={query}/>}
