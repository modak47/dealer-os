"use client";
import { usePathname } from "next/navigation";
import { AdminSidebar } from "./admin-sidebar";
import { LogoutButton } from "./logout-button";

export function AdminShell({children}:{children:React.ReactNode}){const pathname=usePathname();if(pathname==="/admin")return <>{children}</>;return <div className="admin-shell"><AdminSidebar/><div className="admin-main"><div className="admin-top"><span>Secure dealer management</span><div><button>?</button><b>AM</b><LogoutButton/></div></div>{children}</div></div>}
