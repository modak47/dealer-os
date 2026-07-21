"use client";

import { useState } from "react";
import type { PublicStockBike } from "@/lib/stock";
import { BikeCard } from "../components/bike-card";
import { compareImageAvailability } from "@/lib/stock-images";

const categories=["Adventure","Custom","Roadster","Scooters","Super Sports","125cc"];
const imageCompare=(a:PublicStockBike,b:PublicStockBike)=>compareImageAvailability(a.photoReady,b.photoReady);
const newestCompare=(a:PublicStockBike,b:PublicStockBike)=>Date.parse(b.createdTime||"0")-Date.parse(a.createdTime||"0");

export function UsedBikesClient({bikes}:{bikes:PublicStockBike[]}) {
  const [query,setQuery]=useState(""); const [make,setMake]=useState(""); const [model,setModel]=useState("");
  const [maxPrice,setMaxPrice]=useState(0); const [inStock,setInStock]=useState(false);
  const [sort,setSort]=useState("featured");
  const makes=[...new Set(bikes.map(b=>b.make).filter(Boolean))].sort();
  const models=[...new Set(bikes.filter(b=>!make||b.make===make).map(b=>b.model).filter(Boolean))].sort();
  const shown=bikes.filter(b=>{
    const haystack=`${b.make} ${b.model} ${b.description}`.toLowerCase();
    return (!query||haystack.includes(query.toLowerCase()))&&(!make||b.make===make)&&(!model||b.model===model)&&
      (!maxPrice||b.price<=maxPrice)&&(!inStock||b.status==="In Stock");
  }).sort((a,b)=>{
    if(sort==="price")return a.price-b.price||imageCompare(a,b)||newestCompare(a,b);
    if(sort==="newest")return b.year-a.year||imageCompare(a,b)||newestCompare(a,b);
    return imageCompare(a,b)||newestCompare(a,b);
  });

  return <div className="content wide"><div className="filters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search make, model or keyword"/><select value={make} onChange={e=>{setMake(e.target.value);setModel("")}}><option value="">All makes</option>{makes.map(x=><option key={x}>{x}</option>)}</select><select value={model} onChange={e=>setModel(e.target.value)}><option value="">All models</option>{models.map(x=><option key={x}>{x}</option>)}</select><select value={maxPrice} onChange={e=>setMaxPrice(Number(e.target.value))}><option value="0">Any price</option><option value="10000">Under £10,000</option></select><button type="button">Search stock</button></div><div className="inventory-layout"><aside className="filter-side"><h3>FILTER BIKES</h3>{categories.map(x=><label key={x}><input type="checkbox" disabled/> {x}</label>)}<h3>AVAILABILITY</h3><label><input type="checkbox" checked={inStock} onChange={e=>setInStock(e.target.checked)}/> In stock</label><label><input type="checkbox"/> Finance available</label></aside><div><div className="results-bar"><span>Showing {shown.length} motorcycles</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="featured">Sort: Featured</option><option value="price">Price: Low to high</option><option value="newest">Newest first</option></select></div><div className="inventory-grid">{shown.map(b=><BikeCard bike={b} key={b.id}/>)}</div></div></div></div>;
}
