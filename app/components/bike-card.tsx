"use client";
import Link from "next/link";
import {useState} from "react";
import {money} from "@/lib/mock-data";
import type {PublicStockBike} from "@/lib/stock";
export function BikeCard({bike}:{bike:PublicStockBike}){const [opening,setOpening]=useState(false);return <Link prefetch href={`/used-bikes/${bike.slug}`} onClick={()=>setOpening(true)} className={`bike-card ${opening?"opening":""}`} aria-label={`View ${bike.year} ${bike.make} ${bike.model}`}><div className="bike-photo"><img src={bike.image} alt={`${bike.make} ${bike.model}`}/><span className={bike.status==="Reserved"?"badge red":"badge"}>{bike.status}</span>{opening&&<span className="bike-opening"><i/>Opening bike…</span>}</div><div className="bike-info"><h3>{bike.year} {bike.make} {bike.model}</h3><p>{bike.mileage}</p><div className="bike-price"><strong>{money(bike.price)}</strong><small>From £{bike.monthly}/month</small></div><div className="bike-perks"><span>{bike.status==="Reserved"?"Reserved":"Reserve for £99"}</span><span>Enquire</span></div></div></Link>}
