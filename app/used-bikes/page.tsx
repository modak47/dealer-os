import { getPublicStockBikes } from "@/lib/stock";
import { getWebsitePageByPath, metadataFromWebsitePage } from "@/lib/website-pages";
import { UsedBikesClient } from "./used-bikes-client";

export const revalidate=60;

export async function generateMetadata() {
  const page = await getWebsitePageByPath("/used-bikes");
  return metadataFromWebsitePage(page, {
    title: "Used Motorcycles",
    description: "Browse quality used motorcycles for sale at YesMoto.",
    path: "/used-bikes",
  });
}

export default async function Used(){
  const [bikes,page]=await Promise.all([getPublicStockBikes(),getWebsitePageByPath("/used-bikes")]);
  return <><section className="page-hero"><div className="wide"><p className="kicker">{page?.hero_kicker||`${bikes.length} BIKES IN STOCK`}</p><h1>{page?.hero_title||"USED MOTORCYCLES"}</h1><p>{page?.hero_subtitle||"Every bike is hand-picked, HPI checked and professionally prepared by our workshop."}</p></div></section><UsedBikesClient bikes={bikes}/></>;
}
