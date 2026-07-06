import {AdminShell} from "./admin-shell";
import {getAdminIdentity} from "@/lib/admin-identity";
export default async function AdminLayout({children}:{children:React.ReactNode}){const identity=await getAdminIdentity();return <AdminShell identity={identity}>{children}</AdminShell>}
