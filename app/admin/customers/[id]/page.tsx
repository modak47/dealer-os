import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage } from "../../dashboard/page";
import { getCrmCustomer, getCustomerTimeline } from "@/lib/crm";
import { CustomerLocationMap } from "@/components/maps/CustomerLocationMap";
import { CustomerEditor } from "./customer-editor";
import { CopyButton } from "./copy-button";

export const dynamic = "force-dynamic";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCrmCustomer(id);
  if (!result.data) notFound();
  const customer = result.data;
  const linked = await getCustomerTimeline(id);
  const address = [customer.address_line_1, customer.address_line_2, customer.address_line_3, customer.city, customer.county, customer.postcode, customer.country].filter(Boolean).join(", ");
  const portalCode = customer.portal_access_code || "";
  const portalLogin = [customer.email && `Email: ${customer.email}`, portalCode && `Portal code: ${portalCode}`, "Portal: /portal"].filter(Boolean).join("\n");
  const timeline = [
    ...linked.activities.map(item => ({ date: item.created_at, type: item.activity_type, title: item.subject, copy: item.body, href: "" })),
    ...linked.enquiries.map(item => ({ date: item.created_at, type: "Enquiry", title: item.subject || `${item.source} enquiry`, copy: item.message, href: "" })),
    ...linked.leads.map(item => ({ date: item.created_at, type: "Lead", title: `${item.source} - ${item.status}`, copy: item.notes, href: `/admin/leads/${item.id}` })),
    ...linked.sales.map(item => ({ date: item.created_at, type: "Sale", title: `${item.invoice_number ?? "Sale"} - ${item.status}`, copy: `${item.bike?.make ?? ""} ${item.bike?.model ?? ""} ${item.bike?.registration ?? ""}`.trim(), href: `/admin/sales/${item.id}` })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  return <AdminPage title={`${customer.first_name} ${customer.last_name}`} sub="Customer profile, linked records and complete dealership timeline." actions={<div className="quick-actions"><Link href={`/admin/sales/new?customer=${id}`}>Sell / reserve bike</Link><Link href={`/admin/leads?customer=${id}`}>Create lead</Link></div>}>
    <CustomerEditor customer={customer} />
    <div className="crm-detail-grid">
      <aside className="crm-profile-card">
        <span>{`${customer.first_name[0] ?? ""}${customer.last_name[0] ?? ""}`}</span>
        <h2>{customer.first_name} {customer.last_name}</h2>
        <ProfileCopyRow href={customer.email ? `mailto:${customer.email}` : undefined} value={customer.email || ""} empty="No email" label="Copy email address" />
        <ProfileCopyRow href={customer.phone ? `tel:${customer.phone}` : undefined} value={customer.phone || ""} empty="No phone" label="Copy phone number" />
        <ProfileCopyRow value={address} empty="Address not recorded" label="Copy address" />
        <ProfileCopyRow value={portalCode} empty="Run portal migration" prefix="Portal code:" label="Copy portal code" />
        <div className="crm-profile-actions"><Link href="/portal" target="_blank">Open customer portal</Link><CopyButton value={portalLogin} label="Copy portal login details" /></div>
        {customer.latitude != null && customer.longitude != null && <a href="#customer-map">View on map</a>}
        <div>{customer.tags?.map(tag => <b key={tag}>{tag}</b>)}</div>
      </aside>
      <section className="crm-linked">
        <div className="crm-kpis"><article><span>Leads</span><strong>{linked.leads.length}</strong></article><article><span>Reservations</span><strong>{linked.reservations.length}</strong></article><article><span>Sales</span><strong>{linked.sales.length}</strong></article><article><span>Activities</span><strong>{linked.activities.length}</strong></article></div>
        <h2>Customer timeline</h2>
        <div className="crm-timeline">{timeline.map((item, index) => <article key={`${item.type}-${item.date}-${index}`}><i /><div><span>{item.type} - {new Date(item.date).toLocaleString("en-GB")}</span><h3>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}</h3>{item.copy && <p>{item.copy}</p>}</div></article>)}{!timeline.length && <div className="crm-empty"><b>No activity yet</b><span>Enquiries, calls, tasks and reservations will form this timeline automatically.</span></div>}</div>
      </section>
    </div>
    {customer.latitude != null && customer.longitude != null && <section id="customer-map" className="crm-customer-map"><div><h2>Customer location</h2><p>{address}</p></div><CustomerLocationMap latitude={Number(customer.latitude)} longitude={Number(customer.longitude)} address={address} /></section>}
  </AdminPage>;
}

function ProfileCopyRow({ value, empty, href, prefix, label }: { value: string; empty: string; href?: string; prefix?: string; label: string }) {
  const content = <>{prefix && <b>{prefix}</b>} {value || empty}</>;
  return <div className="crm-copy-row">
    {href && value ? <a href={href}>{content}</a> : <p>{content}</p>}
    <CopyButton value={value} label={label} />
  </div>;
}
