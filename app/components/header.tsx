"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dealership, phoneHref } from "@/config/dealership";
import { DealerLogo } from "./dealer-logo";
import { Heart, Menu, Phone, Search } from "./icons";

const nav=[["Used Bikes","/used-bikes"],["Stock","/stock"],["Finance","/finance"],["Part Exchange","/part-exchange"],["Sell My Bike","/sell-my-bike"],["Trade","/contact"],["About Us","/about"]];
const moreLinks=[
  {name:"Reserve Online",href:"/reserve-online",description:"Secure your bike for £99"},
  {name:"Nationwide Delivery",href:"/nationwide-delivery",description:"Delivery throughout the UK"},
  {name:"Motorcycle Preparation",href:"/motorcycle-preparation",description:"How every bike is prepared"},
  {name:"Why Buy From Us",href:"/why-buy-from-yesmoto",description:"The YesMoto difference"},
  {name:"Used Bike Warranty",href:"/used-motorcycle-warranty",description:"Ride away with confidence"},
];

export function Header(){
  const pathname=usePathname();
  const [moreOpen,setMoreOpen]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const dropdownRef=useRef<HTMLDivElement>(null);
  const closeMenus=()=>{setMoreOpen(false);setMobileOpen(false)};

  useEffect(()=>{closeMenus()},[pathname]);
  useEffect(()=>{
    const onPointerDown=(event:PointerEvent)=>{if(moreOpen&&!dropdownRef.current?.contains(event.target as Node))setMoreOpen(false)};
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape")closeMenus()};
    document.addEventListener("pointerdown",onPointerDown);
    document.addEventListener("keydown",onKeyDown);
    return()=>{document.removeEventListener("pointerdown",onPointerDown);document.removeEventListener("keydown",onKeyDown)};
  },[moreOpen]);

  return <>
    <div className="topbar">GET THE TRUE VALUE FOR YOUR BIKE <i/> <Link href="/sell-my-bike">SELL MY BIKE TODAY</Link></div>
    <header><div className="wide header-row">
      <DealerLogo/>
      <nav>{nav.map(([name,href])=><Link href={href} onClick={closeMenus} key={name}>{name}{name==="Used Bikes"&&<small>⌄</small>}</Link>)}
        <div ref={dropdownRef} className={`nav-dropdown ${moreOpen?"open":""}`}>
          <button type="button" aria-haspopup="menu" aria-expanded={moreOpen} onClick={()=>setMoreOpen(open=>!open)}>More <small>⌄</small></button>
          {moreOpen&&<div role="menu">{moreLinks.map(item=><Link role="menuitem" href={item.href} onClick={closeMenus} key={item.href}><b>{item.name}</b><span>{item.description}</span></Link>)}</div>}
        </div>
      </nav>
      <div className="head-actions"><Link href="/admin" className="staff-login" onClick={closeMenus}>Staff Login</Link><Link href="/used-bikes" onClick={closeMenus} aria-label="Search"><Search/></Link><Link href="/used-bikes?favourites=true" onClick={closeMenus} aria-label="Favourites"><Heart/></Link><a href={phoneHref} className="phone"><Phone/><span><b>{dealership.phone}</b><small>{dealership.openingHours}</small></span></a></div>
      <div className={`mobile-nav ${mobileOpen?"open":""}`}><button type="button" onClick={()=>setMobileOpen(open=>!open)} aria-label="Open navigation" aria-expanded={mobileOpen}><Menu/></button>{mobileOpen&&<div><Link href="/admin" className="mobile-staff-login" onClick={closeMenus}>Staff Login<span>→</span></Link>{nav.map(([name,href])=><Link href={href} onClick={closeMenus} key={name}>{name}<span>→</span></Link>)}<p>MORE</p>{moreLinks.map(item=><Link href={item.href} onClick={closeMenus} key={item.href}>{item.name}<span>→</span></Link>)}</div>}</div>
    </div></header>
  </>;
}
