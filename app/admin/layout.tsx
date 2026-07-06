import {AdminShell} from "./admin-shell";
import {getAdminIdentity} from "@/lib/admin-identity";
import type {Viewport} from "next";
export const viewport:Viewport={width:"device-width",initialScale:1,maximumScale:1,userScalable:false,viewportFit:"cover"};
export default async function AdminLayout({children}:{children:React.ReactNode}){const identity=await getAdminIdentity();return <AdminShell identity={identity}>{children}</AdminShell>}
