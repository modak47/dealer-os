"use client";

import { FormEvent, useState } from "react";

type LookupResult=Record<string,unknown>;
type FlatValue={leaf:string;path:string;value:unknown};
type Field={label:string;aliases:string[]};

const normal=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
function flatten(value:unknown,path="",output:FlatValue[]=[]):FlatValue[]{
  if(value&&typeof value==="object"&&!Array.isArray(value)){for(const [key,child] of Object.entries(value)){const childPath=path?`${path}.${key}`:key;if(child&&typeof child==="object")flatten(child,childPath,output);else output.push({leaf:normal(key),path:normal(childPath),value:child})}}return output;
}
function findValue(values:FlatValue[],aliases:string[]):unknown{for(const alias of aliases){const wanted=normal(alias);const exact=values.find(item=>item.leaf===wanted);if(exact?.value!==undefined&&exact.value!==null&&exact.value!=="")return exact.value;const nested=values.find(item=>item.path.endsWith(wanted));if(nested?.value!==undefined&&nested.value!==null&&nested.value!=="")return nested.value}return null}
const show=(value:unknown)=>value===null||value===undefined||value===""?"—":typeof value==="boolean"?(value?"Yes":"No"):String(value);
const formatVrm=(value:unknown)=>{const clean=show(value).replace(/\s+/g,"");return clean!=="—"&&clean.length===7?`${clean.slice(0,4)} ${clean.slice(4)}`:show(value)};

const vehicleFields:Field[]=[
  {label:"Registration",aliases:["vrm","registration","registrationNumber","registrationMark"]},{label:"Make",aliases:["make","manufacturer"]},{label:"Model",aliases:["model"]},{label:"Derivative",aliases:["derivative","variant","trim"]},{label:"Year",aliases:["year","yearOfManufacture","modelYear"]},{label:"Colour",aliases:["colour","color"]},{label:"Body Style",aliases:["bodyStyle","bodyType"]},{label:"Vehicle Class",aliases:["vehicleClass","taxClass"]},{label:"Doors",aliases:["doors","numberOfDoors"]},{label:"Seats",aliases:["seats","numberOfSeats"]},
];
const motFields:Field[]=[
  {label:"MOT Status",aliases:["motStatus","mot.status","motTestStatus"]},{label:"MOT Expiry",aliases:["motExpiryDate","mot.expiryDate","motDueDate"]},{label:"Mileage Last MOT",aliases:["mileageLastMot","lastMotMileage","motMileage","odometerValue"]},{label:"Mileage Estimate",aliases:["mileageEstimate","estimatedMileage"]},{label:"Expired",aliases:["expired","isExpired","motExpired"]},
];
const keeperFields:Field[]=[
  {label:"Registration Date",aliases:["registrationDate","dateFirstRegistered","firstRegistrationDate"]},{label:"Keeper Since",aliases:["keeperSince","keeperStartDate","currentKeeperSince"]},{label:"Previous Keepers",aliases:["previousKeepers","numberOfPreviousKeepers","keeperCount"]},
];
const technicalFields:Field[]=[
  {label:"Fuel",aliases:["fuel","fuelType"]},{label:"Transmission",aliases:["transmission","transmissionType","gearbox"]},{label:"Engine",aliases:["engine","engineSize","engineCapacity","cc"]},{label:"VIN",aliases:["vin","vehicleIdentificationNumber","chassisNumber"]},{label:"Manufacture Date",aliases:["manufactureDate","dateOfManufacture","manufacturedDate"]},
];

function DataGrid({fields,values}:{fields:Field[];values:FlatValue[]}){return <div className="vehicle-data-grid">{fields.map(field=>{const value=findValue(values,field.aliases);return <div className={value==null?"missing":""} key={field.label}><span>{field.label}</span><strong>{field.label==="Registration"?formatVrm(value):show(value)}</strong></div>})}</div>}

export function VrmLookupClient(){
  const [vrm,setVrm]=useState("");const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [result,setResult]=useState<LookupResult|null>(null);const [copied,setCopied]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const cleaned=vrm.trim().replace(/\s+/g,"").toUpperCase();if(!cleaned){setError("Enter a registration number.");setResult(null);return}setVrm(cleaned);setLoading(true);setError("");setResult(null);try{const response=await fetch("/api/vrm-lookup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vrm:cleaned})});const data:unknown=await response.json();if(!response.ok){const message=data&&typeof data==="object"&&"error" in data?String((data as {error:unknown}).error):"Vehicle lookup failed.";throw new Error(message)}setResult(data&&typeof data==="object"&&!Array.isArray(data)?data as LookupResult:{result:data})}catch(caught){setError(caught instanceof Error?caught.message:"Vehicle lookup failed. Please try again.")}finally{setLoading(false)}}
  async function copy(value:string,name:string){if(!value||value==="—")return;await navigator.clipboard.writeText(value);setCopied(name);window.setTimeout(()=>setCopied(""),1600)}
  function reset(){setVrm("");setResult(null);setError("");setCopied("");window.setTimeout(()=>document.getElementById("vrm")?.focus(),0)}

  const values=result?flatten(result):[];
  const registration=formatVrm(findValue(values,["vrm","registration","registrationNumber"])??vrm);
  const make=show(findValue(values,["make","manufacturer"]));const model=show(findValue(values,["model"]));const derivative=show(findValue(values,["derivative","variant","trim"]));
  const vin=show(findValue(values,["vin","vehicleIdentificationNumber","chassisNumber"]));
  const tax=show(findValue(values,["taxStatus","tax.status","vehicleTaxStatus"]));const mot=show(findValue(values,["motStatus","mot.status","motTestStatus"]));const expired=findValue(values,["expired","isExpired"]);
  const taxGood=/taxed|valid|active/i.test(tax);const motGood=/valid|pass|active|taxed/i.test(mot);const isExpired=expired===true||String(expired).toLowerCase()==="true";

  return <div className="vrm-tool"><section className="vrm-search-card"><div><span className="vrm-icon">VRM</span><div><h2>LOOK UP A VEHICLE</h2><p>Enter a registration to retrieve its available vehicle data.</p></div></div><form onSubmit={submit}><label htmlFor="vrm">Registration number</label><div><input id="vrm" value={vrm} onChange={event=>setVrm(event.target.value.toUpperCase())} placeholder="YM21 NZK" autoComplete="off" maxLength={10} disabled={loading}/><button type="submit" disabled={loading}>{loading?<><i/>Looking up…</>:"Lookup vehicle"}</button></div></form></section>
    {error&&<div className="vrm-error" role="alert"><b>Lookup unsuccessful</b><p>{error}</p></div>}
    {result&&<section className="vehicle-summary"><header><div className="vehicle-title"><span className="summary-icon">✓</span><div><p>VEHICLE SUMMARY</p><h2>{make} {model}</h2><small>{derivative}</small></div></div><strong className="registration-plate">{registration}</strong></header>
      <div className="vehicle-badges"><span className={taxGood?"good":tax==="—"?"neutral":"bad"}>{tax==="—"?"Tax —":tax}</span><span className={motGood?"good":mot==="—"?"neutral":"bad"}>{mot==="—"?"MOT —":`MOT ${mot}`}</span><span className={isExpired?"bad":"good"}>{isExpired?"Expired":"Active"}</span></div>
      <div className="summary-highlights"><div><span>Registration</span><strong>{registration}</strong></div>{[...vehicleFields.slice(1,6),...technicalFields.slice(0,3)].map(field=><div key={field.label}><span>{field.label}</span><strong>{show(findValue(values,field.aliases))}</strong></div>)}</div>
      <div className="vehicle-actions"><button onClick={()=>copy(registration,"Registration")}>▣ {copied==="Registration"?"Copied":"Copy Registration"}</button><button onClick={()=>copy(vin,"VIN")}>◇ {copied==="VIN"?"Copied":"Copy VIN"}</button><button onClick={()=>copy(JSON.stringify(result,null,2),"JSON")}>{`{ }`} {copied==="JSON"?"Copied":"Copy JSON"}</button><button className="primary" onClick={reset}>↻ New Lookup</button></div>
      <div className="vehicle-sections"><details open><summary><span>▾</span> Vehicle Details <i>+</i></summary><DataGrid fields={vehicleFields} values={values}/></details><details><summary><span>▾</span> MOT &amp; Mileage <i>+</i></summary><DataGrid fields={motFields} values={values}/></details><details><summary><span>▾</span> Keeper Information <i>+</i></summary><DataGrid fields={keeperFields} values={values}/></details><details><summary><span>▾</span> Technical Data <i>+</i></summary><DataGrid fields={technicalFields} values={values}/></details><details className="raw-json"><summary><span>▾</span> Raw JSON <i>+</i></summary><pre>{JSON.stringify(result,null,2)}</pre></details></div>
    </section>}
  </div>;
}
