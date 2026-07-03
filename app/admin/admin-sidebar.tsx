"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { dealership } from "@/config/dealership";
import { DealerLogo } from "@/app/components/dealer-logo";

const items=[["Overview","/admin/dashboard"],["Stock","/admin/stock"],["VRM Lookup","/admin/vrm-lookup"],["Leads","/admin/leads"],["Customers","/admin/customers"],["Sales channels","/admin/sales-channels"],["Settings","/admin/settings"]];
export function AdminSidebar(){const pathname=usePathname();return <aside className="admin-side"><DealerLogo admin/><p>POWERING {dealership.dealerName.toUpperCase()}</p><nav>{items.map(([name,href])=><Link href={href} className={pathname===href||pathname.startsWith(`${href}/`)?"active":""} aria-current={pathname===href?"page":undefined} key={href}><span>{name.slice(0,1)}</span>{name}</Link>)}</nav><div className="admin-user"><b>AM</b><div>Alex Morgan<small>{dealership.dealerName} · Administrator</small></div></div></aside>}
