"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import { usePathname } from "next/navigation";
import { AdminSidebar } from "./admin-sidebar";
import { LogoutButton } from "./logout-button";
import type { AdminIdentity } from "@/lib/admin-identity";

const mobileItems=[["Home","/admin/dashboard","⌂"],["Stock","/admin/stock","M"],["Leads","/admin/leads","L"],["Customers","/admin/customers","C"]];
export function AdminShell({children,identity}:{children:React.ReactNode;identity:AdminIdentity|null}){
  const pathname=usePathname();const [menuOpen,setMenuOpen]=useState(false);useEffect(()=>setMenuOpen(false),[pathname]);
  if(pathname==="/admin")return <>{children}</>;
  return <div className="admin-shell">
    <button className={`admin-drawer-backdrop ${menuOpen?"open":""}`} aria-label="Close navigation" onClick={()=>setMenuOpen(false)}/>
    <AdminSidebar identity={identity} mobileOpen={menuOpen} onNavigate={()=>setMenuOpen(false)}/>
    <div className="admin-main"><div className="admin-top"><button className="admin-menu-button" onClick={()=>setMenuOpen(true)} aria-label="Open navigation">☰</button><form action="/admin/search" className="admin-global-search"><input name="q" placeholder="Search customers, stock, registration, VIN…" aria-label="Search DealerOS"/></form><div><button className="admin-help">?</button><b title={identity?.name??"Signed-in user"}>{identity?.initials??"YM"}</b><LogoutButton/></div></div>{children}</div>
    <nav className="admin-bottom-nav">{mobileItems.map(([name,href,icon])=><Link href={href} className={pathname===href||pathname.startsWith(`${href}/`)?"active":""} key={href}><i>{icon}</i><span>{name}</span></Link>)}<button onClick={()=>setMenuOpen(true)}><i>•••</i><span>More</span></button></nav>
  </div>;
}
