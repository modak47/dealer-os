"use client";
import { usePathname } from "next/navigation";
import { AdminSidebar } from "./admin-sidebar";
import { LogoutButton } from "./logout-button";
import type { AdminIdentity } from "@/lib/admin-identity";

export function AdminShell({children,identity}:{children:React.ReactNode;identity:AdminIdentity|null}){const pathname=usePathname();if(pathname==="/admin")return <>{children}</>;return <div className="admin-shell"><AdminSidebar identity={identity}/><div className="admin-main"><div className="admin-top"><form action="/admin/search" className="admin-global-search"><input name="q" placeholder="Search customers, stock, registration, VIN…" aria-label="Search DealerOS"/></form><div><button>?</button><b title={identity?.name??"Signed-in user"}>{identity?.initials??"YM"}</b><LogoutButton/></div></div>{children}</div></div>}
