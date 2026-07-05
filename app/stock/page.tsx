import type { Metadata } from "next";
import { StockPageClient } from "./stock-page-client";

export const metadata:Metadata={title:"Stock",description:"Browse YesMoto motorcycle stock."};
export default function StockPage(){return <StockPageClient/>}
