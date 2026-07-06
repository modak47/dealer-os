import Link from "next/link";
import { AdminPage } from "../dashboard/page";
import { getCrmCustomers } from "@/lib/crm";

export const dynamic="force-dynamic";
export default async function Customers({searchParams}:{searchParams:Promise<{q?:string}>}){const {q=""}=await searchParams;const result=await getCrmCustomers(q);return <AdminPage title="Customers" sub="Your single customer record, contact history and linked dealership activity." actions={<Link href="/admin/customers/new" className="admin-primary">+ Add customer</Link>}>
  {!result.migrationReady&&<div className="crm-setup"><b>CRM database setup required</b><span>Run the CRM foundation migration in Supabase before adding customers.</span></div>}
  <form className="admin-filters"><input name="q" defaultValue={q} placeholder="Search name, email, phone or postcode..."/><button>Search</button></form>
  <div className="table-wrap"><table className="admin-table crm-table"><thead><tr><th>Customer</th><th>Contact</th><th>Postcode</th><th>Tags</th><th>Updated</th><th/></tr></thead><tbody>{result.data.map(customer=><tr key={customer.id}><td><Link href={`/admin/customers/${customer.id}`}><b>{customer.first_name} {customer.last_name}</b></Link></td><td>{customer.email||customer.phone||"—"}<small>{customer.email&&customer.phone?customer.phone:""}</small></td><td>{customer.postcode||"—"}</td><td>{customer.tags?.join(", ")||"—"}</td><td>{new Date(customer.updated_at).toLocaleDateString("en-GB")}</td><td><Link className="crm-row-link" href={`/admin/customers/${customer.id}`}>Open →</Link></td></tr>)}</tbody></table>{result.migrationReady&&!result.data.length&&<div className="crm-empty"><b>No customers yet</b><span>New website enquiries and manually-created customers will appear here.</span></div>}</div>
  </AdminPage>}
