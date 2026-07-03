import Link from "next/link";
import { money } from "@/lib/mock-data";
import type { PublicStockBike } from "@/lib/stock";
import { Heart } from "./icons";

export function BikeCard({bike}:{bike:PublicStockBike}){return <Link href={`/used-bikes/${bike.slug}`} className="bike-card" aria-label={`View ${bike.year} ${bike.make} ${bike.model}`}>
  <div className="bike-photo"><img src={bike.image} alt={`${bike.make} ${bike.model}`}/><span className={bike.status==="Reserved"?"badge red":"badge"}>{bike.status}</span><span className="favourite-icon" aria-hidden="true"><Heart/></span></div>
  <div className="bike-info"><h3>{bike.year} {bike.make} {bike.model}</h3><p>{bike.mileage}</p><div className="bike-price"><strong>{money(bike.price)}</strong><small>From £{bike.monthly}/month</small></div><div className="bike-perks"><span>{bike.status==="Reserved"?"Reserved":"Reserve for £99"}</span><span>Enquire</span></div></div>
</Link>}
