"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { dealership } from "@/config/dealership";
import { DealerLogo } from "@/app/components/dealer-logo";
import type { AdminIdentity } from "@/lib/admin-identity";

const items=[["Overview","/admin/dashboard"],["Stock","/admin/stock"],["Workflow","/workflow"],["Workshop","/workshop"],["Valeting","/valeting"],["Photos","/photos"],["New Sale","/admin/sales/new"],["Invoices","/admin/accounts/invoices"],["Market","/market-intelligence"],["Opportunities","/admin/opportunities"],["Retail Checker","/admin/retail-check"],["VRM Lookup","/admin/vrm-lookup"],["Leads","/admin/leads"],["Customers","/admin/customers"],["Sales channels","/admin/sales-channels"],["Settings","/admin/settings"]];
export function AdminSidebar({identity,mobileOpen=false,onNavigate}:{identity:AdminIdentity|null;mobileOpen?:boolean;onNavigate?:()=>void}){const pathname=usePathname();return <aside className={`admin-side ${mobileOpen?"mobile-open":""}`}><div className="admin-side-mobile-head"><DealerLogo admin/><button onClick={onNavigate} aria-label="Close navigation">×</button></div><p>POWERING {dealership.dealerName.toUpperCase()}</p><nav>{items.map(([name,href])=><Link href={href} onClick={onNavigate} className={pathname===href||pathname.startsWith(`${href}/`)?"active":""} aria-current={pathname===href?"page":undefined} key={href}><span>{name.slice(0,1)}</span>{name}</Link>)}</nav><Link className="admin-website-link" href="/" target="_blank">← Back to website</Link><div className="admin-user"><b>{identity?.initials??"YM"}</b><div>{identity?.name??"Signed-in user"}<small>{dealership.dealerName} · {identity?.role??"Team member"}</small></div></div></aside>}
