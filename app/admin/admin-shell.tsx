"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AdminSidebar } from "./admin-sidebar";
import { LogoutButton } from "./logout-button";
import type { AdminIdentity } from "@/lib/admin-identity";

const mobileItems = [["Home", "/admin/dashboard", "⌂"], ["Stock", "/admin/stock", "M"], ["Web Leads", "/website-leads", "W"], ["Customers", "/admin/customers", "C"]];

export function AdminShell({ children, identity }: { children: React.ReactNode; identity: AdminIdentity | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  useEffect(() => { setMenuOpen(false); setNavigating(false); }, [pathname]);
  if (pathname === "/admin") return <>{children}</>;

  function startNavigation(event: React.MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || `${url.pathname}${url.search}` === `${window.location.pathname}${window.location.search}`) return;
    setNavigating(true);
  }

  return <div className={`admin-shell ${navigating ? "is-navigating" : ""}`} onClickCapture={startNavigation}>
    {navigating && <div className="admin-navigation-progress" role="status" aria-live="polite"><i /><span>Loading page…</span></div>}
    <button className={`admin-drawer-backdrop ${menuOpen ? "open" : ""}`} aria-label="Close navigation" onClick={() => setMenuOpen(false)} />
    <AdminSidebar identity={identity} mobileOpen={menuOpen} onNavigate={() => setMenuOpen(false)} />
    <div className="admin-main"><div className="admin-top"><button className="admin-menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation">☰</button><form action="/admin/search" className="admin-global-search" onSubmit={() => setNavigating(true)}><input name="q" placeholder="Search customers, stock, registration, VIN…" aria-label="Search DealerOS" /></form><div><button className="admin-help">?</button><b title={identity?.name ?? "Signed-in user"}>{identity?.initials ?? "YM"}</b><LogoutButton /></div></div>{children}</div>
    <nav className="admin-bottom-nav">{mobileItems.map(([name, href, icon]) => <Link href={href} className={pathname === href || pathname.startsWith(`${href}/`) ? "active" : ""} key={href}><i>{icon}</i><span>{name}</span></Link>)}<button onClick={() => setMenuOpen(true)}><i>•••</i><span>More</span></button></nav>
  </div>;
}
