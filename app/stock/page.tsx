import type { Metadata } from "next";
import { getPublicStockBikes } from "@/lib/stock";
import { getWebsitePageByPath, metadataFromWebsitePage } from "@/lib/website-pages";
import { StockPageClient } from "./stock-page-client";

export const revalidate=60;
export async function generateMetadata():Promise<Metadata>{return metadataFromWebsitePage(await getWebsitePageByPath("/stock"),{title:"Stock",description:"Browse YesMoto motorcycle stock.",path:"/stock"})}
export default async function StockPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){const [bikes,query]=await Promise.all([getPublicStockBikes(),searchParams]);return <StockPageClient bikes={bikes} initial={query}/>}
