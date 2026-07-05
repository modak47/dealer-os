"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicStockBike } from "@/lib/stock";

const money=(value:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format(value);

export function StockPageClient({bikes}:{bikes:PublicStockBike[]}){
  const [query,setQuery]=useState("");
  const shown=useMemo(()=>bikes.filter(bike=>!query||`${bike.make} ${bike.model} ${bike.variant} ${bike.bodyStyle} ${bike.category} ${bike.description}`.toLowerCase().includes(query.toLowerCase())),[bikes,query]);
  return <><section className="stock-page-hero"><div className="wide"><p>YESMOTO USED MOTORCYCLES</p><h1>BIKES FOR SALE</h1><span>Carefully selected, professionally prepared and available for nationwide delivery.</span></div></section><div className="stock-page wide"><div className="stock-search"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search make, model or motorcycle type..."/><span>{shown.length} motorcycle{shown.length===1?"":"s"}</span></div>{shown.length===0?<div className="stock-state"><b>No motorcycles found</b><span>{query?"Try a different search.":"Please check back soon for our latest motorcycles."}</span></div>:<div className="public-stock-grid">{shown.map(bike=><PublicStockCard bike={bike} key={bike.id}/>)}</div>}</div></>;
}

function PublicStockCard({bike}:{bike:PublicStockBike}){
  const specs=[bike.bodyStyle||bike.category,bike.engineCc>0?`${bike.engineCc.toLocaleString("en-GB")}cc`:"",bike.transmission].filter(Boolean);
  return <Link href={`/used-bikes/${bike.slug}`} className="public-stock-card"><div className="public-stock-image"><img src={bike.image} alt={`${bike.make} ${bike.model}${bike.variant?` ${bike.variant}`:""}`}/><span className={bike.status==="Reserved"?"reserved":""}>{bike.status}</span></div><div className="public-stock-copy"><p>{bike.year||"Year unavailable"}</p><h2>{bike.make} {bike.model}</h2>{bike.variant&&<h3>{bike.variant}</h3>}<div className="public-stock-specs"><span>{bike.mileage}</span>{specs.map(spec=><span key={spec}>{spec}</span>)}</div><div className="public-stock-action"><strong>{money(bike.price)}</strong><b>View motorcycle →</b></div></div></Link>;
}
