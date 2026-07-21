"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { dealership } from "@/config/dealership";
import { DealerLogo } from "@/app/components/dealer-logo";
import type { AdminIdentity } from "@/lib/admin-identity";

type NavItem = { name: string; href: string; icon: string };
type NavGroup = { name: string; key: string; items: NavItem[] };

const groups: NavGroup[] = [
  { name: "Overview", key: "overview", items: [{ name: "Overview", href: "/admin/dashboard", icon: "O" }, { name: "Settings", href: "/admin/settings", icon: "*" }, { name: "Website SEO", href: "/admin/settings/website-pages", icon: "W" }] },
  { name: "Sales", key: "sales", items: [{ name: "Stock", href: "/admin/stock", icon: "S" }, { name: "Book In", href: "/admin/stock/book-in", icon: "B" }, { name: "Financial Ledger", href: "/admin/ledger", icon: "L" }, { name: "Stock Ledger", href: "/admin/stock-ledger", icon: "$" }, { name: "Sales Pipeline", href: "/admin/sales", icon: "P" }, { name: "Shadow Mode", href: "/admin/settings/shadow-mode", icon: "T" }, { name: "Dealer5 Shadow", href: "/admin/settings/dealer5-shadow", icon: "D" }, { name: "New Sale", href: "/admin/sales/new", icon: "N" }, { name: "Invoices", href: "/admin/accounts/invoices", icon: "I" }, { name: "Customers", href: "/admin/customers", icon: "C" }] },
  { name: "Preparation", key: "preparation", items: [{ name: "Collections", href: "/admin/collections", icon: "C" }, { name: "Workflow", href: "/workflow", icon: "W" }, { name: "Workshop", href: "/workshop", icon: "W" }, { name: "Valeting", href: "/valeting", icon: "V" }, { name: "Photos", href: "/photos", icon: "P" }] },
  { name: "Buying Tools", key: "buying", items: [{ name: "Market", href: "/market-intelligence", icon: "M" }, { name: "Opportunities", href: "/admin/opportunities", icon: "O" }, { name: "Retail Checker", href: "/admin/retail-check", icon: "R" }, { name: "VRM Lookup", href: "/admin/vrm-lookup", icon: "V" }] },
  { name: "Leads", key: "leads", items: [{ name: "Leads", href: "/admin/leads", icon: "L" }, { name: "Website Leads", href: "/website-leads", icon: "W" }, { name: "Dealer Contacts", href: "/dealer-contacts", icon: "D" }] },
];

const storageKey = "yesmoto-admin-sidebar-open-group";

export function AdminSidebar({ identity, mobileOpen = false, onNavigate }: { identity: AdminIdentity | null; mobileOpen?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const currentGroup = useMemo(() => groups.find(group => group.items.some(item => isActive(pathname, item.href)))?.key, [pathname]);
  const [openGroup, setOpenGroup] = useState(currentGroup ?? groups[0].key);

  useEffect(() => {
    let cancelled = false;
    try {
      const saved = window.localStorage.getItem(storageKey);
      window.setTimeout(() => {
        if (!cancelled) setOpenGroup(currentGroup || saved || groups[0].key);
      }, 0);
    } catch {
      window.setTimeout(() => {
        if (!cancelled) setOpenGroup(currentGroup || groups[0].key);
      }, 0);
    }
    return () => { cancelled = true; };
  }, [currentGroup]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, openGroup);
    } catch {}
  }, [openGroup]);

  function toggleGroup(key: string) {
    setOpenGroup(current => current === key ? "" : key);
  }

  return <aside className={`admin-side ${mobileOpen ? "mobile-open" : ""}`}>
    <div className="admin-side-mobile-head"><DealerLogo admin /><button onClick={onNavigate} aria-label="Close navigation">x</button></div>
    <p>POWERING {dealership.dealerName.toUpperCase()}</p>
    <nav className="admin-side-nav" aria-label="Admin navigation">
      {groups.map(group => {
        const open = openGroup === group.key;
        const activeGroup = group.key === currentGroup;
        return <section className="admin-nav-group" key={group.key}>
          <button type="button" className={`admin-nav-group-toggle ${activeGroup ? "active" : ""}`} aria-expanded={open} aria-controls={`admin-nav-${group.key}`} onClick={() => toggleGroup(group.key)}>
            <span>{group.name}</span><b>{group.items.length}</b><i aria-hidden="true">{open ? "^" : "v"}</i>
          </button>
          <div id={`admin-nav-${group.key}`} className={`admin-nav-group-items ${open ? "open" : ""}`}>
            {group.items.map(item => {
              const active = isActive(pathname, item.href);
              return <Link href={item.href} onClick={onNavigate} className={active ? "active" : ""} aria-current={active ? "page" : undefined} key={item.href}><span>{item.icon}</span>{item.name}</Link>;
            })}
          </div>
        </section>;
      })}
    </nav>
    <Link className="admin-website-link" href="/" target="_blank">Back to website</Link>
    <div className="admin-user"><b>{identity?.initials ?? "YM"}</b><div>{identity?.name ?? "Signed-in user"}<small>{dealership.dealerName} - {identity?.role ?? "Team member"}</small></div></div>
  </aside>;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
