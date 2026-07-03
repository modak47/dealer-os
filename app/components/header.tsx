import Link from "next/link";
import { dealership, phoneHref } from "@/config/dealership";
import { DealerLogo } from "./dealer-logo";
import { Heart, Menu, Phone, Search } from "./icons";

const nav = [["Used Bikes","/used-bikes"],["Finance","/finance"],["Part Exchange","/part-exchange"],["Sell My Bike","/sell-my-bike"],["Trade","/contact"],["About Us","/about"]];
const moreLinks=[
  {name:"Reserve Online",href:"/reserve-online",description:"Secure your bike for £99"},
  {name:"Nationwide Delivery",href:"/nationwide-delivery",description:"Delivery throughout the UK"},
  {name:"Motorcycle Preparation",href:"/motorcycle-preparation",description:"How every bike is prepared"},
  {name:"Why Buy From Us",href:"/why-buy-from-yesmoto",description:"The YesMoto difference"},
  {name:"Used Bike Warranty",href:"/used-motorcycle-warranty",description:"Ride away with confidence"},
];

export function Header(){return <>
  <div className="topbar">GET THE TRUE VALUE FOR YOUR BIKE <i/> <Link href="/sell-my-bike">SELL MY BIKE TODAY</Link></div>
  <header><div className="wide header-row">
    <DealerLogo/>
    <nav>{nav.map(([n,h])=><Link href={h} key={n}>{n}{n==="Used Bikes"&&<small>⌄</small>}</Link>)}<details className="nav-dropdown"><summary>More <small>⌄</small></summary><div>{moreLinks.map(item=><Link href={item.href} key={item.href}><b>{item.name}</b><span>{item.description}</span></Link>)}</div></details></nav>
    <div className="head-actions"><Link href="/used-bikes" aria-label="Search"><Search/></Link><Link href="/used-bikes?favourites=true" aria-label="Favourites"><Heart/></Link><a href={phoneHref} className="phone"><Phone/><span><b>{dealership.phone}</b><small>{dealership.openingHours}</small></span></a></div>
    <details className="mobile-nav"><summary aria-label="Open navigation"><Menu/></summary><div>{nav.map(([n,h])=><Link href={h} key={n}>{n}<span>→</span></Link>)}<p>MORE</p>{moreLinks.map(item=><Link href={item.href} key={item.href}>{item.name}<span>→</span></Link>)}</div></details>
  </div></header>
</>}
