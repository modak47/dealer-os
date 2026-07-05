import { getPublicStockBikes } from "@/lib/stock";
import { UsedBikesClient } from "./used-bikes-client";

export const metadata={title:"Used Motorcycles"};
export const revalidate=60;

export default async function Used(){
  const bikes=await getPublicStockBikes();
  return <><section className="page-hero"><div className="wide"><p className="kicker">{bikes.length} BIKES IN STOCK</p><h1>USED MOTORCYCLES</h1><p>Every bike is hand-picked, HPI checked and professionally prepared by our workshop.</p></div></section><UsedBikesClient bikes={bikes}/></>;
}
