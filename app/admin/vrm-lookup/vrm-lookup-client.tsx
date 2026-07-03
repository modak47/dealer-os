"use client";

import { FormEvent, useState } from "react";

type LookupResult=Record<string,unknown>;
const label=(key:string)=>key.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/[_-]+/g," ").replace(/^./,character=>character.toUpperCase());
const displayValue=(value:unknown)=>value==null||value===""?"—":typeof value==="boolean"?(value?"Yes":"No"):typeof value==="object"?JSON.stringify(value,null,2):String(value);

export function VrmLookupClient(){
  const [vrm,setVrm]=useState(""); const [loading,setLoading]=useState(false); const [error,setError]=useState(""); const [result,setResult]=useState<LookupResult|null>(null);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const cleaned=vrm.trim().replace(/\s+/g,"").toUpperCase();if(!cleaned){setError("Enter a registration number.");setResult(null);return}setVrm(cleaned);setLoading(true);setError("");setResult(null);try{const response=await fetch("/api/vrm-lookup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vrm:cleaned})});const data:unknown=await response.json();if(!response.ok){const message=data&&typeof data==="object"&&"error" in data?String((data as {error:unknown}).error):"Vehicle lookup failed.";throw new Error(message)}setResult(data&&typeof data==="object"&&!Array.isArray(data)?data as LookupResult:{result:data})}catch(caught){setError(caught instanceof Error?caught.message:"Vehicle lookup failed. Please try again.")}finally{setLoading(false)}}
  return <div className="vrm-tool"><section className="vrm-search-card"><div><span className="vrm-icon">VRM</span><div><h2>LOOK UP A VEHICLE</h2><p>Enter a registration to retrieve its available vehicle data.</p></div></div><form onSubmit={submit}><label htmlFor="vrm">Registration number</label><div><input id="vrm" value={vrm} onChange={event=>setVrm(event.target.value.toUpperCase())} placeholder="YM21 NZK" autoComplete="off" maxLength={10} disabled={loading}/><button type="submit" disabled={loading}>{loading?<><i/>Looking up…</>:"Lookup vehicle"}</button></div></form></section>
    {error&&<div className="vrm-error" role="alert"><b>Lookup unsuccessful</b><p>{error}</p></div>}
    {result&&<section className="vrm-results"><div className="panel-title"><div><p>LOOKUP COMPLETE</p><h2>VEHICLE DETAILS</h2></div><span>{vrm}</span></div><div className="vrm-result-grid">{Object.entries(result).map(([key,value])=><div key={key}><span>{label(key)}</span><strong className={typeof value==="object"&&value!==null?"json-value":""}>{displayValue(value)}</strong></div>)}</div><details className="raw-json"><summary>Raw JSON / debug response <span>+</span></summary><pre>{JSON.stringify(result,null,2)}</pre></details></section>}
  </div>;
}
