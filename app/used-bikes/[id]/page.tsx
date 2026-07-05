import Link from "next/link";
import { notFound } from "next/navigation";
import { BikeCard } from "@/app/components/bike-card";
import { dealership, phoneHref } from "@/config/dealership";
import { money } from "@/lib/mock-data";
import { getBikeBySlugOrId, getPublicStockBikes, type PublicStockBike } from "@/lib/stock";
import { BikeGallery } from "./bike-gallery";
import { VehicleEnquiryForm } from "./vehicle-enquiry-form";

type SpecItem={label:string;value:string};
const clean=(value:unknown)=>typeof value==="string"?value.trim():typeof value==="number"?String(value):"";
const normal=(value:string)=>value.toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g," ").trim();

function specificationSource(bike:PublicStockBike){
  const values=new Map<string,string>();
  const add=(key:string,value:unknown)=>{const text=clean(value);if(text&&!values.has(normal(key)))values.set(normal(key),text)};
  const walk=(value:unknown,prefix="")=>{if(!value||typeof value!=="object"||Array.isArray(value))return;for(const [key,item] of Object.entries(value as Record<string,unknown>)){const path=prefix?`${prefix} ${key}`:key;if(item&&typeof item==="object"&&!Array.isArray(item))walk(item,path);else{add(key,item);add(path,item)}}};
  walk(bike.specifications);walk(bike.dealer5Fields);
  const find=(...names:string[])=>{for(const name of names){const exact=values.get(normal(name));if(exact)return exact}return ""};
  return {find};
}

function makeSpecs(bike:PublicStockBike){
  const {find}=specificationSource(bike);
  const grid:SpecItem[]=[
    {label:"Category",value:bike.bodyStyle||bike.category||find("Body Type","Category")},{label:"Transmission",value:bike.transmission||find("Transmission","Gearbox")},
    {label:"Colour",value:bike.colour||find("Colour")},{label:"Mileage",value:bike.mileage},{label:"Fuel",value:bike.fuel||find("Fuel","Fuel Type")},
    {label:"Power",value:find("BHP","Power","Max Power")},{label:"Torque",value:find("Torque","Max Torque")},{label:"Engine",value:bike.engineCc>0?`${bike.engineCc.toLocaleString("en-GB")}cc`:find("Engine Size","Engine Capacity")},
    {label:"CO₂",value:find("CO2","CO2 Emissions")},{label:"Year",value:String(bike.year||"")},{label:"Road tax",value:find("Road Tax","Tax")},
    {label:"Previous owners",value:bike.previousOwners||find("Previous Owners")},{label:"MOT expiry",value:bike.motExpiry||find("MOT Expiry Date")},{label:"Registered",value:bike.registrationDate||find("Registration Date")},
  ].filter(item=>item.value);
  const group=(title:string,items:[string,string[]][])=>({title,items:items.map(([label,names])=>({label,value:find(...names)})).filter(item=>item.value)});
  return {grid,groups:[
    group("Performance",[["Power",["BHP","Power","Max Power"]],["Torque",["Torque","Max Torque"]],["Top speed",["Top Speed"]],["Acceleration",["Acceleration","0-60 mph"]]]),
    group("Engine & Drive Train",[["Engine size",["Engine Size","Engine Capacity"]],["Cylinders",["Cylinders"]],["Valves",["Valves"]],["Transmission",["Transmission","Gearbox"]],["Gears",["Gears","Number of Gears"]],["Drive",["Drive Type","Final Drive"]],["Cooling",["Cooling System"]]]),
    group("Emissions",[["CO₂",["CO2","CO2 Emissions"]],["Euro status",["Euro Status","Emission Class"]],["Emissions",["Emissions"]]]),
    group("Weight and Capacities",[["Kerb weight",["Kerb Weight","Weight"]],["Dry weight",["Dry Weight"]],["Fuel capacity",["Fuel Capacity","Tank Capacity"]],["Payload",["Payload"]]]),
    group("Dimensions",[["Length",["Length"]],["Width",["Width"]],["Height",["Height"]],["Seat height",["Seat Height"]],["Wheelbase",["Wheelbase"]]]),
    group("Other",[["Body style",["Body Type","Category"]],["Colour",["Colour"]],["Road tax",["Road Tax","Tax"]],["Previous owners",["Previous Owners"]],["MOT expiry",["MOT Expiry Date"]],["Registration date",["Registration Date"]]]),
  ].filter(section=>section.items.length)};
}

function DescriptionContent({text}:{text:string}){
  const headings=new Map([["key details","Key Details"],["fitted extras","Fitted Extras"],["preparation","Preparation"],["why buy from yesmoto","Why Buy From YesMoto"]]);
  const sections:{heading:string;lines:string[]}[]=[{heading:"About this motorcycle",lines:[]}];
  for(const raw of text.replace(/\r/g,"").split("\n")){const line=raw.trim();if(!line)continue;const heading=headings.get(normal(line).replace(/\s+/g," "));if(heading){sections.push({heading,lines:[]});sections[sections.length-1].heading=heading}else sections[sections.length-1].lines.push(line)}
  return <div className="vehicle-description-copy">{sections.filter(section=>section.lines.length).map(section=><section key={section.heading}><h3>{section.heading}</h3>{section.lines.map((line,index)=>/^[•*\-✓✔]/.test(line)?<p className="description-bullet" key={index}>{line.replace(/^[•*\-✓✔]\s*/,"")}</p>:<p key={index}>{line}</p>)}</section>)}</div>;
}

export default async function Detail({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const bike=await getBikeBySlugOrId(id);if(!bike)notFound();
  const related=await getPublicStockBikes();const gallery=bike.imageUrls.length?bike.imageUrls:[bike.image];const specs=makeSpecs(bike);
  const title=[bike.year,bike.make,bike.model,bike.variant].filter(Boolean).join(" ");
  const description=bike.description||`A superb example of the ${bike.make} ${bike.model}, professionally inspected and prepared by YesMoto.`;
  const whatsappNumber=dealership.phone.replace(/^0/,"44").replace(/\D/g,"");const whatsapp=`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi YesMoto, I'm interested in the ${title}.`)}`;
  return <main className="vehicle-detail">
    <section className="vehicle-hero"><div className="wide"><nav><Link href="/">Home</Link><span>/</span><Link href="/used-bikes">Used bikes</Link><span>/</span><b>{bike.make} {bike.model}</b></nav><div className="vehicle-hero-grid"><div><span className={bike.status==="Reserved"?"vehicle-status reserved":"vehicle-status"}>{bike.status}</span><h1>{title}</h1>{bike.attentionGrabber&&<p>{bike.attentionGrabber}</p>}<div className="vehicle-hero-facts"><span>{bike.mileage}</span>{bike.registrationDate&&<span>Registered {bike.registrationDate}</span>}{(bike.bodyStyle||bike.category)&&<span>{bike.bodyStyle||bike.category}</span>}{bike.engineCc>0&&<span>{bike.engineCc.toLocaleString("en-GB")}cc</span>}</div></div><div className="vehicle-hero-price"><small>OUR PRICE</small><strong>{money(bike.price)}</strong><span>Finance available · Part exchange welcome</span></div></div><div className="vehicle-hero-actions">{bike.status==="Reserved"?<span className="disabled">Currently reserved</span>:<Link href="#enquiry" className="reserve">Reserve online for £99</Link>}<a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp us</a><Link href="#enquiry">Request callback</Link><Link href="/part-exchange">Part exchange</Link></div></div></section>

    <div className="vehicle-main wide"><div className="vehicle-content"><BikeGallery images={gallery} alt={title}/><section className="vehicle-spec-section"><p className="vehicle-kicker">AT A GLANCE</p><h2>Motorcycle specification</h2><div className="vehicle-spec-grid">{specs.grid.map((item,index)=><div key={item.label}><i>{index+1}</i><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></section><section className="vehicle-description"><p className="vehicle-kicker">THE FULL STORY</p><h2>About this motorcycle</h2><DescriptionContent text={description}/></section><section className="vehicle-accordion"><p className="vehicle-kicker">TECHNICAL INFORMATION</p><h2>Full specifications</h2>{specs.groups.length?specs.groups.map((section,index)=><details open={index===0} key={section.title}><summary>{section.title}<span>+</span></summary><dl>{section.items.map(item=><div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></details>):<p className="vehicle-muted">Please contact us for the complete technical specification.</p>}</section></div>
      <aside className="vehicle-action-panel"><p>{bike.status}</p><h2>{bike.make} {bike.model}</h2>{bike.variant&&<h3>{bike.variant}</h3>}<strong>{money(bike.price)}</strong><small>Finance available subject to status</small>{bike.status==="Reserved"?<span className="panel-disabled">This motorcycle is reserved</span>:<Link href="#enquiry" className="panel-primary">Reserve online for £99</Link>}<a href={phoneHref}>Call {dealership.phone}</a><a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp</a><Link href="#enquiry">Enquire</Link><Link href="/part-exchange">Part exchange</Link><div><b>BUY WITH CONFIDENCE</b><span>Nationwide delivery</span><span>Warranty included</span><span>HPI checked</span></div></aside>
    </div>

    <section className="vehicle-trust"><div className="wide">{[["Nationwide delivery","Specialist motorcycle transport throughout mainland UK."],["Finance available","Flexible options through our trusted finance partners."],["Reserve for £99","Secure your chosen motorcycle online, any time."],["HPI checked","Every retail motorcycle receives a vehicle history check."],["Warranty included","Qualifying motorcycles include nationwide warranty cover."],["Prepared properly","Individually inspected and prepared before handover."]].map(([heading,copy],index)=><article key={heading}><span>{index+1}</span><h3>{heading}</h3><p>{copy}</p></article>)}</div></section>
    <section className="vehicle-enquiry" id="enquiry"><div className="wide"><div><p className="vehicle-kicker">ASK ABOUT THIS MOTORCYCLE</p><h2>Speak to the YesMoto team</h2><p>Request a callback, ask for another photograph or discuss finance, delivery and part exchange. We’ll give you a straightforward answer.</p><a href={phoneHref}>{dealership.phone}</a></div><VehicleEnquiryForm bike={title}/></div></section>
    <section className="vehicle-related wide"><div className="section-title"><h2>YOU MAY ALSO LIKE</h2><Link href="/used-bikes">View all bikes</Link></div><div className="bike-grid">{related.filter(item=>item.id!==bike.id).slice(0,3).map(item=><BikeCard bike={item} key={item.id}/>)}</div></section>
    <a className="floating-whatsapp" href={whatsapp} target="_blank" rel="noreferrer" aria-label="Chat with YesMoto on WhatsApp">WhatsApp</a>
  </main>;
}
