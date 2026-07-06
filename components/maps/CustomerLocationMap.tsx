"use client";
import dynamic from "next/dynamic";
const MapInner=dynamic(()=>import("./customer-location-map-inner").then(module=>module.CustomerLocationMapInner),{ssr:false,loading:()=> <div className="customer-map-loading">Loading map…</div>});
export function CustomerLocationMap(props:{latitude:number;longitude:number;address:string;className?:string}){return <MapInner {...props}/>}
