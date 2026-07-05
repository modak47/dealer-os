import Link from "next/link";
import { notFound } from "next/navigation";
import { BikeCard } from "@/app/components/bike-card";
import { dealership } from "@/config/dealership";
import { money } from "@/lib/mock-data";
import { getBikeBySlugOrId, getPublicStockBikes } from "@/lib/stock";
import { BikeGallery } from "./bike-gallery";

export default async function Detail({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const b=await getBikeBySlugOrId(id);if(!b)notFound();
  const bikes=await getPublicStockBikes();const gallery=b.imageUrls.length?b.imageUrls:[b.image];
  return <div className="content wide">
    <p style={{color:"#8b959c"}}>Home / Used bikes / {b.make} {b.model}</p>
    <div className="detail-grid"><BikeGallery images={gallery} alt={`${b.make} ${b.model}`}/><aside className="detail-panel"><p style={{color:dealership.primaryColour,fontWeight:800}}>{b.status.toUpperCase()}</p><h1>{b.year} {b.make}<br/>{b.model}</h1>{b.attentionGrabber&&<p>{b.attentionGrabber}</p>}<p className="price">{money(b.price)}</p><p>Finance from <b>£{b.monthly}/month</b></p><div className="spec-row"><div><small>Mileage</small><b>{b.mileage}</b></div><div><small>Year</small><b>{b.year||"—"}</b></div></div><div className="button-stack">{b.status==="Reserved"?<span className="red" aria-disabled="true">Reserved</span>:<Link href="/contact" className="red">Reserve for £99</Link>}<Link href="/contact">Enquire about this bike</Link><Link href="/finance" className="outline">Apply for finance</Link></div></aside></div>
    <section className="copy-block"><h2>ABOUT THIS BIKE</h2><p>{b.description||`A superb example of the ${b.make} ${b.model}. This motorcycle has been through our comprehensive workshop inspection and is ready to ride away.`}</p><table className="details-table"><tbody><tr><td>Year</td><td>{b.year||"—"}</td></tr><tr><td>Mileage</td><td>{b.mileage}</td></tr>{b.colour&&<tr><td>Colour</td><td>{b.colour}</td></tr>}{b.engineCc>0&&<tr><td>Engine</td><td>{b.engineCc.toLocaleString("en-GB")}cc</td></tr>}{b.fuel&&<tr><td>Fuel</td><td>{b.fuel}</td></tr>}{b.transmission&&<tr><td>Transmission</td><td>{b.transmission}</td></tr>}{b.bodyStyle&&<tr><td>Body type</td><td>{b.bodyStyle}</td></tr>}{b.motExpiry&&<tr><td>MOT expiry</td><td>{b.motExpiry}</td></tr>}{b.previousOwners&&<tr><td>Previous owners</td><td>{b.previousOwners}</td></tr>}<tr><td>Status</td><td>{b.status}</td></tr></tbody></table></section>
    <section className="featured" style={{paddingTop:55}}><div className="section-title"><h2>SIMILAR BIKES</h2></div><div className="bike-grid">{bikes.filter(x=>x.id!==b.id).slice(0,3).map(x=><BikeCard bike={x} key={x.id}/>)}</div></section>
  </div>;
}
