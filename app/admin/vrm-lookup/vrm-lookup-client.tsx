"use client";

import { FormEvent, useState } from "react";

type LookupResult=Record<string,unknown>;
type Vehicle=Record<string,unknown>&{
  vrm_pretty?:unknown;vrm?:unknown;make?:unknown;model?:unknown;genericModel?:unknown;body?:unknown;bodyCategory?:unknown;
  fuel?:unknown;transmission?:unknown;engine_size?:unknown;year?:unknown;manufactureYear?:unknown;colour?:unknown;
  firstRegistered?:unknown;keeperStartDate?:unknown;previousKeepersCount?:unknown;numberOfSeats?:unknown;numberOfDoors?:unknown;
  vin?:unknown;euroStatus?:unknown;lastMOTStatus?:unknown;last_mot_date?:unknown;lastMOTExpiry?:unknown;lastMOTPass?:unknown;
  lastMOTAdvisories?:unknown;mileageLastMot?:unknown;mileageEst?:unknown;expired?:unknown;taxStatus?:unknown;tax_status?:unknown;
};
type DisplayField={label:string;value:string};

const text=(value:unknown)=>typeof value==="string"?value.trim():typeof value==="number"?String(value):"";
const nestedText=(value:unknown,key:string)=>value&&typeof value==="object"&&key in value?text((value as Record<string,unknown>)[key]):"";
const shown=(value:unknown)=>{if(value===null||value===undefined||value==="")return "—";if(Array.isArray(value))return value.length?value.map(item=>typeof item==="object"?JSON.stringify(item):String(item)).join(", "):"—";if(typeof value==="object")return JSON.stringify(value);return String(value)};
const mileage=(value:unknown)=>{if(value===null||value===undefined||value==="")return "—";const number=Number(value);return Number.isFinite(number)?`${number.toLocaleString("en-GB")} miles`:`${String(value)} miles`};
const prettyVrm=(value:string)=>{const clean=value.replace(/\s+/g,"").toUpperCase();return clean.length===7?`${clean.slice(0,4)} ${clean.slice(4)}`:value||"—"};

function DataGrid({fields}:{fields:DisplayField[]}){return <div className="vehicle-data-grid">{fields.map(field=><div className={field.value==="—"?"missing":""} key={field.label}><span>{field.label}</span><strong>{field.value}</strong></div>)}</div>}

export function VrmLookupClient(){
  const [vrm,setVrm]=useState("");const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [result,setResult]=useState<LookupResult|null>(null);const [copied,setCopied]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const cleaned=vrm.trim().replace(/\s+/g,"").toUpperCase();if(!cleaned){setError("Enter a registration number.");setResult(null);return}setVrm(cleaned);setLoading(true);setError("");setResult(null);try{const response=await fetch("/api/vrm-lookup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vrm:cleaned})});const data:unknown=await response.json();if(!response.ok){const message=data&&typeof data==="object"&&"error" in data?String((data as {error:unknown}).error):"Vehicle lookup failed.";throw new Error(message)}setResult(data&&typeof data==="object"&&!Array.isArray(data)?data as LookupResult:{result:data})}catch(caught){setError(caught instanceof Error?caught.message:"Vehicle lookup failed. Please try again.")}finally{setLoading(false)}}
  async function copy(value:string,name:string){if(!value||value==="—")return;await navigator.clipboard.writeText(value);setCopied(name);window.setTimeout(()=>setCopied(""),1600)}
  function reset(){setVrm("");setResult(null);setError("");setCopied("");window.setTimeout(()=>document.getElementById("vrm")?.focus(),0)}

  const vehicle=(result?.vehicle&&typeof result.vehicle==="object"?result.vehicle:{}) as Vehicle;
  const registration=prettyVrm(text(vehicle.vrm_pretty)||text(vehicle.vrm)||vrm);
  const make=nestedText(vehicle.make,"display_name")||nestedText(vehicle.make,"map_id")||text(vehicle.make)||"—";
  const model=text(vehicle.model)||nestedText(vehicle.genericModel,"display_name")||"—";
  const body=text(vehicle.body)||text(vehicle.bodyCategory)||"—";const fuel=text(vehicle.fuel)||"—";const transmission=text(vehicle.transmission)||"—";
  const engine=vehicle.engine_size?`${vehicle.engine_size}cc`:"—";const year=shown(vehicle.year||vehicle.manufactureYear);const colour=shown(vehicle.colour);
  const firstRegistered=shown(vehicle.firstRegistered);const keeperSince=shown(vehicle.keeperStartDate);const previousKeepers=vehicle.previousKeepersCount??"—";
  const seats=vehicle.numberOfSeats??"—";const doors=vehicle.numberOfDoors??"—";const vin=shown(vehicle.vin);const euroStatus=shown(vehicle.euroStatus);
  const motStatus=shown(vehicle.lastMOTStatus);const motExempt=motStatus.toUpperCase()==="EXEMPT";const taxStatus=text(vehicle.taxStatus)||text(vehicle.tax_status);
  const expired=vehicle.expired===true||text(vehicle.expired).toLowerCase()==="true";const headline=[year,make,model].filter(value=>value!=="—").join(" ")||registration;
  const subline=[colour,fuel,engine].filter(value=>value!=="—").join(" • ");
  const vehicleFields:DisplayField[]=[{label:"Registration",value:registration},{label:"Make",value:make},{label:"Model",value:model},{label:"Year",value:year},{label:"Colour",value:colour},{label:"Body Style",value:body},{label:"Doors",value:shown(doors)},{label:"Seats",value:shown(seats)}];
  const motFields:DisplayField[]=[{label:"MOT Status",value:motStatus},{label:"Last MOT Date",value:shown(vehicle.last_mot_date)},{label:"Last MOT Expiry",value:shown(vehicle.lastMOTExpiry)},{label:"Last MOT Pass",value:shown(vehicle.lastMOTPass)},{label:"Last MOT Advisories",value:shown(vehicle.lastMOTAdvisories)},{label:"Mileage Last MOT",value:mileage(vehicle.mileageLastMot)},{label:"Estimated Mileage",value:mileage(vehicle.mileageEst)},{label:"Expired",value:expired?"Yes":"No"}];
  const keeperFields:DisplayField[]=[{label:"First Registered",value:firstRegistered},{label:"Keeper Since",value:keeperSince},{label:"Previous Keepers",value:shown(previousKeepers)}];
  const technicalFields:DisplayField[]=[{label:"Fuel",value:fuel},{label:"Transmission",value:transmission},{label:"Engine",value:engine},{label:"VIN",value:vin},{label:"Euro Status",value:euroStatus}];

  return <div className="vrm-tool"><section className="vrm-search-card"><div><span className="vrm-icon">VRM</span><div><h2>LOOK UP A VEHICLE</h2><p>Enter a registration to retrieve its available vehicle data.</p></div></div><form onSubmit={submit}><label htmlFor="vrm">Registration number</label><div><input id="vrm" value={vrm} onChange={event=>setVrm(event.target.value.toUpperCase())} placeholder="YM21 NZK" autoComplete="off" maxLength={10} disabled={loading}/><button type="submit" disabled={loading}>{loading?<><i/>Looking up…</>:"Lookup vehicle"}</button></div></form></section>
    {error&&<div className="vrm-error" role="alert"><b>Lookup unsuccessful</b><p>{error}</p></div>}
    {result&&<section className="vehicle-summary"><header><div className="vehicle-title"><span className="summary-icon">✓</span><div><p>VEHICLE SUMMARY</p><h2>{headline}</h2><small>{subline||"Vehicle data returned successfully"}</small></div></div><strong className="registration-plate">{registration}</strong></header>
      <div className="vehicle-badges">{taxStatus&&<span className={/taxed|valid|active/i.test(taxStatus)?"good":"bad"}>{taxStatus}</span>}{motExempt?<span className="exempt">MOT exempt</span>:motStatus!=="—"&&<span className={/pass|valid|active/i.test(motStatus)?"good":"bad"}>MOT {motStatus}</span>}<span className={expired?"bad":"good"}>{expired?"Expired":"Active"}</span></div>
      <div className="summary-highlights">{[{label:"Registration",value:registration},{label:"Year",value:year},{label:"Colour",value:colour},{label:"Fuel",value:fuel},{label:"Transmission",value:transmission},{label:"Engine",value:engine}].map(field=><div key={field.label}><span>{field.label}</span><strong>{field.value}</strong></div>)}</div>
      <div className="vehicle-actions"><button onClick={()=>copy(registration,"Registration")}>▣ {copied==="Registration"?"Copied":"Copy Registration"}</button><button onClick={()=>copy(vin,"VIN")}>◇ {copied==="VIN"?"Copied":"Copy VIN"}</button><button onClick={()=>copy(JSON.stringify(result,null,2),"JSON")}>{`{ }`} {copied==="JSON"?"Copied":"Copy JSON"}</button><button className="primary" onClick={reset}>↻ New Lookup</button></div>
      <div className="vehicle-sections"><details open><summary><span>▾</span> Vehicle Details <i>+</i></summary><DataGrid fields={vehicleFields}/></details><details><summary><span>▾</span> MOT &amp; Mileage <i>+</i></summary><DataGrid fields={motFields}/></details><details><summary><span>▾</span> Keeper Information <i>+</i></summary><DataGrid fields={keeperFields}/></details><details><summary><span>▾</span> Technical Data <i>+</i></summary><DataGrid fields={technicalFields}/></details><details className="raw-json"><summary><span>▾</span> Raw JSON <i>+</i></summary><pre>{JSON.stringify(result,null,2)}</pre></details></div>
    </section>}
  </div>;
}
