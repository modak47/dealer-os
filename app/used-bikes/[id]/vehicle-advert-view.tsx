"use client";

import Link from "next/link";
import { BikeCard } from "@/app/components/bike-card";
import { dealership, phoneHref } from "@/config/dealership";
import { money } from "@/lib/mock-data";
import type { PublicStockBike, PublicStockDetailBike } from "@/lib/stock";
import { stripUnsafeAdvertText } from "@/lib/render-advert-template";
import { BikeGallery } from "./bike-gallery";
import { VehicleEnquiryForm } from "./vehicle-enquiry-form";
import { VehicleSpecIcon, type IconType } from "./vehicle-spec-icon";
import { ReserveButton } from "./reserve-button";

type SpecItem={label:string;value:string;icon:IconType};
type DescriptionSection={key:string;title:string;content:string[]};

const clean=(value:unknown)=>typeof value==="string"?value.trim():typeof value==="number"?String(value):"";
const normal=(value:string)=>value.toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g," ").trim();

function specificationSource(bike:PublicStockDetailBike){
  const values=new Map<string,string>();
  const add=(key:string,value:unknown)=>{const text=clean(value);if(text&&!values.has(normal(key)))values.set(normal(key),text)};
  const walk=(value:unknown,prefix="")=>{if(!value||typeof value!=="object"||Array.isArray(value))return;for(const [key,item] of Object.entries(value as Record<string,unknown>)){const path=prefix?`${prefix} ${key}`:key;if(item&&typeof item==="object"&&!Array.isArray(item))walk(item,path);else{add(key,item);add(path,item)}}};
  walk(bike.specifications);walk(bike.dealer5Fields);
  return (...names:string[])=>{for(const name of names){const found=values.get(normal(name));if(found)return found}return ""};
}

function makeSpecs(bike:PublicStockDetailBike){
  const find=specificationSource(bike);
  const stripCandidates:SpecItem[]=[
    {label:"Category",value:bike.bodyStyle||bike.category||find("Body Type","Category"),icon:"bike"},{label:"Transmission",value:bike.transmission||find("Transmission","Gearbox"),icon:"gear"},
    {label:"Colour",value:bike.colour||find("Colour"),icon:"colour"},{label:"Mileage",value:bike.mileage,icon:"gauge"},{label:"Fuel",value:bike.fuel||find("Fuel","Fuel Type"),icon:"fuel"},
    {label:"BHP",value:find("BHP","Power","Max Power"),icon:"power"},{label:"Torque",value:find("Max Torque","Torque"),icon:"gauge"},{label:"CC",value:bike.engineCc>0?`${bike.engineCc.toLocaleString("en-GB")}cc`:find("Engine Size","Engine Capacity"),icon:"engine"},
    {label:"CO2",value:find("CO2","CO2 Emissions"),icon:"leaf"},{label:"Year",value:String(bike.year||""),icon:"calendar"},{label:"Road tax",value:find("Road Tax","Tax"),icon:"tax"},
    {label:"Former keepers",value:bike.previousOwners||find("Previous Owners"),icon:"user"},{label:"MOT expiry",value:bike.motExpiry||find("MOT Expiry Date"),icon:"shield"},
  ];
  const strip=stripCandidates.filter(item=>item.value);
  const group=(title:string,items:[string,string[]][])=>({title,items:items.map(([label,names])=>({label,value:find(...names)})).filter(item=>item.value)});
  const groups=[
    group("Performance",[["Power",["BHP","Power","Max Power"]],["Torque",["Max Torque","Torque"]],["Top speed",["Top Speed"]],["Acceleration",["Acceleration","0-60 mph"]]]),
    group("Engine & Drivetrain",[["Engine size",["Engine Size","Engine Capacity"]],["Cylinders",["Cylinders"]],["Valves",["Valves"]],["Transmission",["Transmission","Gearbox"]],["Gears",["Gears","Number of Gears"]],["Final drive",["Drive Type","Final Drive"]],["Cooling",["Cooling System"]]]),
    group("Emissions",[["CO2",["CO2","CO2 Emissions"]],["Euro status",["Euro Status","Emission Class"]],["Emissions",["Emissions"]]]),
    group("Dimensions",[["Length",["Length"]],["Width",["Width"]],["Height",["Height"]],["Seat height",["Seat Height"]],["Wheelbase",["Wheelbase"]]]),
    group("Other",[["Kerb weight",["Kerb Weight","Weight"]],["Fuel capacity",["Fuel Capacity","Tank Capacity"]],["Body style",["Body Type","Category"]],["Colour",["Colour"]],["Road tax",["Road Tax","Tax"]],["Former keepers",["Previous Owners"]],["MOT expiry",["MOT Expiry Date"]],["Registration date",["Registration Date"]]]),
  ].filter(section=>section.items.length);
  return {strip,groups};
}

const descriptionHeadings=[
  {key:"headline",title:"Headline",aliases:["Headline","Attention Grabber"]},{key:"intro",title:"Introduction",aliases:["Intro Description","Introduction","Description"]},
  {key:"details",title:"Key Details",aliases:["Key Details"]},{key:"extras",title:"Fitted Extras",aliases:["Fitted Extras","Extras"]},
  {key:"preparation",title:"Preparation & Service Work Completed",aliases:["Preparation & Service Work Completed","Preparation and Service Work Completed","Preparation","Service Work Completed"]},
  {key:"included",title:"What's Included Before Delivery",aliases:["What's Included Before Delivery","Included Before Delivery"]},
  {key:"why",title:"Why Buy From YesMoto",aliases:["Why Buy From YesMoto","Why Buy From Yes Moto"]},{key:"finance",title:"Finance Options Available",aliases:["Finance Options Available","Finance Available","Finance Options"]},
] as const;

function parseDescription(text:string,attention:string):DescriptionSection[]{
  let prepared=text.replace(/\r/g,"").replace(/[•●▪◦]\s*/g,"\n• ");
  for(const heading of descriptionHeadings){for(const alias of heading.aliases){const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s+");prepared=prepared.replace(new RegExp(`${escaped}\\s*:?`,"gi"),`\n@@${heading.key}@@\n`)}}
  const definitions=new Map<string,string>(descriptionHeadings.map(item=>[item.key,item.title]));const sections:DescriptionSection[]=[];let current:DescriptionSection={key:"intro",title:"Introduction",content:[]};
  const push=()=>{if(current.content.length)sections.push(current)};
  for(const raw of prepared.split(/\n+/)){const marker=raw.trim().match(/^@@(.+)@@$/);if(marker){push();const key=marker[1];current={key,title:definitions.get(key)??"Details",content:[]};continue}const line=stripUnsafeAdvertText(raw);if(!line)continue;current.content.push(line)}push();
  if(attention&&!sections.some(section=>section.key==="headline"))sections.unshift({key:"headline",title:"The headline",content:[stripUnsafeAdvertText(attention)].filter(Boolean)});
  return sections.length?sections:[{key:"intro",title:"About this motorcycle",content:[text]}];
}

function DescriptionContent({text,attention,structured}:{text:string;attention:string;structured:Record<string,unknown>}){
  const canonicalSections:[string,string,string,string[]][]=[
    ["headline","Headline","YESMOTO",["headline","advert_headline"]],
    ["intro","Overview","ADVERT OVERVIEW",["intro","intro_description"]],
    ["key_details","Key Details","AT A GLANCE",["key_details"]],
    ["fitted_extras","Fitted Extras","EQUIPMENT",["fitted_extras"]],
    ["preparation","Preparation","WORKSHOP",["preparation","preparation_work"]],
    ["included","Included Before Delivery","HANDOVER",["included","included_before_delivery"]],
    ["warranty","Warranty","WARRANTY",["warranty"]],
    ["why_buy","Why Buy From YesMoto","WHY YESMOTO",["why_buy","why_buy_from_yesmoto"]],
    ["finance","Finance Options","FINANCE",["finance","finance_options"]],
    ["delivery","Delivery","DELIVERY",["delivery"]],
  ];
  const structuredSections:DescriptionSection[]=canonicalSections.map(([key,title,,aliases])=>{const value=aliases.map(alias=>structured[alias]).find(candidate=>typeof candidate==="string"&&candidate.trim()) as string|undefined;return {key,title,content:value?value.replace(/[•●▪◦]\s*/g,"\n• ").split(/\n+/).map(line=>stripUnsafeAdvertText(line)).filter(Boolean):[]}}).filter(section=>section.content.length);
  const sections=structuredSections.length?structuredSections:parseDescription(text,attention);
  return <div className="vehicle-story-sections">{sections.map(section=>{const bullets=section.content.filter(line=>/^[•*\-✓✔]/.test(line));const prose=section.content.filter(line=>!/^[•*\-✓✔]/.test(line));const eyebrow=canonicalSections.find(([key])=>key===section.key)?.[2]??"VEHICLE DETAILS";return <article className={`vehicle-story-section ${section.key}`} key={`${section.key}-${section.title}`}><header><span>{eyebrow}</span><h3>{section.title}</h3></header><div>{prose.map((line,index)=>{const pieces=line.length>420?line.split(/(?<=[.!?])\s+(?=[A-Z])/).reduce<string[]>((groups,sentence)=>{const last=groups.at(-1)??"";if(last.length<240){groups[groups.length-1]=`${last} ${sentence}`.trim()}else groups.push(sentence);return groups},[""]).filter(Boolean):[line];return pieces.map((piece,pieceIndex)=><p key={`${index}-${pieceIndex}`}>{piece}</p>)})}{bullets.length>0&&<ul>{bullets.map((line,index)=><li key={index}>{line.replace(/^[•*\-✓✔]\s*/,"")}</li>)}</ul>}</div></article>})}</div>;
}

export function VehicleAdvertView({bike,related=[],preview=false,actions}:{bike:PublicStockDetailBike;related?:PublicStockBike[];preview?:boolean;actions?:React.ReactNode}){
  const gallery=bike.imageUrls.length?bike.imageUrls:[bike.image];const specs=makeSpecs(bike);
  const title=[bike.year,bike.make,bike.model,bike.variant].filter(Boolean).join(" ");const subtitle=[bike.mileage,bike.engineCc>0?`${bike.engineCc.toLocaleString("en-GB")}cc`:"",bike.bodyStyle||bike.category,bike.transmission].filter(Boolean).join(" · ");
  const hasAdvertSections=Object.values(bike.advertSections).some(value=>typeof value==="string"&&Boolean(stripUnsafeAdvertText(value).trim()));
  const description=hasAdvertSections?"":bike.description||`A superb example of the ${bike.make} ${bike.model}, professionally inspected and prepared by YesMoto.`;
  const whatsappNumber=dealership.phone.replace(/^0/,"44").replace(/\D/g,"");const whatsapp=`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi YesMoto, I'm interested in the ${title}.`)}`;
  const benefits:[string,string,IconType][]=[["Nationwide delivery","Specialist insured delivery throughout mainland UK.","bike"],["Finance available","Flexible options through trusted finance partners.","tax"],["Reserve for £99","Secure this motorcycle online at any time.","shield"],["HPI checked","Vehicle history checked before it is advertised.","shield"],["Warranty included","Nationwide cover on qualifying motorcycles.","shield"],["Prepared properly","Individually inspected before handover.","gear"]];
  return <main className={`vehicle-detail premium-advert ${preview?"admin-advert-preview-view":""}`}>
    {preview&&<section className="preview-live-banner"><b>PREVIEW — NOT LIVE</b>{actions}</section>}
    <section className="vehicle-hero"><div className="wide vehicle-wrap"><nav><Link href="/">Home</Link><span>/</span><Link href="/stock">Used bikes</Link><span>/</span><b>{bike.make} {bike.model}</b></nav><div className="vehicle-hero-grid"><div><span className={bike.status==="Reserved"?"vehicle-status reserved":"vehicle-status"}>{bike.status}</span><h1>{title}</h1><p>{subtitle}</p></div><div className="vehicle-hero-price"><small>YESMOTO PRICE</small><strong>{money(bike.price)}</strong><span>Finance available · Part exchange welcome</span></div></div><div className="vehicle-hero-actions">{bike.status==="Reserved"?<span className="disabled">Currently reserved</span>:<ReserveButton bikeId={bike.id} slug={bike.slug} bike={title} className="reserve" label="Reserve for £99" />}<a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp</a><a href={phoneHref}>Call us</a><Link href="/part-exchange">Part exchange</Link></div></div></section>
    <div className="vehicle-main wide vehicle-wrap"><div className="vehicle-content"><BikeGallery images={gallery} alt={title}/><section className="premium-spec-strip"><div className="section-intro"><p className="vehicle-kicker">AT A GLANCE</p><h2>Everything you need to know</h2></div><div className="vehicle-spec-grid">{specs.strip.map(item=><div key={item.label}><VehicleSpecIcon type={item.icon}/><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></section><section className="vehicle-description premium-description"><div className="section-intro"><p className="vehicle-kicker">THE FULL STORY</p><h2>About this motorcycle</h2></div><DescriptionContent text={description} attention={bike.attentionGrabber} structured={bike.advertSections}/></section><section className="vehicle-accordion compact-specifications"><div className="section-intro"><p className="vehicle-kicker">TECHNICAL INFORMATION</p><h2>Full specifications</h2></div>{specs.groups.length?<div className="full-spec-groups">{specs.groups.map(section=><section className="full-spec-group" key={section.title}><h3>{section.title}</h3><dl>{section.items.map(item=><div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>)}</div>:<p className="vehicle-muted">Please contact us for the complete technical specification.</p>}</section></div>
      <aside className="vehicle-action-panel"><div className="panel-bike"><span>{bike.status}</span><h2>{bike.make} {bike.model}</h2>{bike.variant&&<p>{bike.variant}</p>}</div><strong>{money(bike.price)}</strong><small>Finance available subject to status</small>{bike.status==="Reserved"?<span className="panel-disabled">This motorcycle is reserved</span>:<ReserveButton bikeId={bike.id} slug={bike.slug} bike={title} className="panel-primary" />}<a href={phoneHref}>Call {dealership.phone}</a><a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp the team</a><Link href="#enquiry">Send an enquiry</Link><Link href="/part-exchange">Value my part exchange</Link><div className="panel-confidence"><b>BUY WITH CONFIDENCE</b><span>Nationwide delivery</span><span>Warranty included</span><span>HPI checked</span></div></aside>
    </div>
    <section className="vehicle-trust"><div className="wide vehicle-wrap">{benefits.map(([heading,copy,icon])=><article key={heading}><VehicleSpecIcon type={icon}/><div><h3>{heading}</h3><p>{copy}</p></div></article>)}</div></section>
    <section className="vehicle-enquiry" id="enquiry"><div className="wide vehicle-wrap"><div className="enquiry-intro"><p className="vehicle-kicker">ASK ABOUT THIS MOTORCYCLE</p><h2>Let&apos;s talk about your next bike</h2><p>Ask for another photograph, arrange a callback, or discuss finance, delivery and part exchange with someone who knows motorcycles.</p><div><a href={phoneHref}>{dealership.phone}</a><span>{dealership.openingHours}</span></div></div><VehicleEnquiryForm bike={title} bikeId={bike.id} whatsapp={whatsapp}/></div></section>
    {!!related.length&&<section className="vehicle-related wide vehicle-wrap"><div className="section-title"><h2>YOU MAY ALSO LIKE</h2><Link href="/stock">View all bikes</Link></div><div className="bike-grid">{related.filter(item=>item.id!==bike.id).slice(0,3).map(item=><BikeCard bike={item} key={item.id}/>)}</div></section>}
  </main>;
}
