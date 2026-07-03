import Link from "next/link";
import { dealership } from "@/config/dealership";
import { leads, money } from "@/lib/mock-data";
import { getActiveStockBikes, getStockStats, isPublic, toPublicBike } from "@/lib/stock";

export default async function Dashboard(){
  const [bikes,stock]=await Promise.all([getActiveStockBikes(),getStockStats()]);
  const newLeads=leads.filter(lead=>lead.status==="New").length;
  const publicBikes=bikes.filter(isPublic);
  const missingImages=bikes.filter(bike=>!bike.image||bike.image==="/bike-placeholder.svg").length;
  const missingPrices=bikes.filter(bike=>bike.price<=0).length;
  const stats=[
    {name:"Total stock",value:stock.totalStock,href:"/admin/stock?filter=active"},{name:"Live stock",value:stock.liveStock,href:"/admin/stock?filter=live"},
    {name:"Reserved",value:stock.reserved,href:"/admin/stock?filter=reserved"},{name:"Sold",value:stock.sold,href:"/admin/stock?filter=sold"},
    {name:"Prep",value:stock.prep,href:"/admin/stock?filter=prep"},{name:"New leads",value:newLeads,href:"/admin/leads?filter=new",alert:true},
    {name:"Website enquiries",value:12,href:"/admin/leads"},{name:"Total retail value",value:money(stock.totalRetailValue),href:"/admin/stock"},
  ];
  const priorities=[
    {label:"Reserved bikes",value:stock.reserved,href:"/admin/stock?filter=reserved"},{label:"New leads",value:newLeads,href:"/admin/leads?filter=new"},
    {label:"Bikes missing images",value:missingImages,href:"/admin/stock?filter=active&warning=image"},{label:"Bikes with no price",value:missingPrices,href:"/admin/stock?filter=active&warning=price"},
  ];
  const breakdown=[{label:"In Stock",value:stock.liveStock},{label:"Reserved",value:stock.reserved},{label:"Sold",value:stock.sold},{label:"Prep",value:stock.prep}];
  return <AdminPage title="Good morning, Alex" sub={`Here’s what’s happening across ${dealership.dealerName} today.`} hint={`Current dealership: ${dealership.dealerName}`} actions={<div className="quick-actions"><Link href="/admin/stock">+ Add Stock</Link><Link href="/admin/leads">View Leads</Link><Link href="/" target="_blank">View Website</Link><Link href="/admin/sales-channels">Sales Channels</Link></div>}>
    <div className="stat-grid">{stats.map((item,index)=><Link className="stat" href={item.href} key={item.name}><span className={item.alert?"alert":""}/><p>{item.name}</p><strong>{item.value}</strong><small>{index<5?"Current inventory":"Updated today"}</small></Link>)}</div>
    <div className="dashboard-insights"><section className="priority-panel"><div className="panel-title"><h2>TODAY’S PRIORITY</h2><span>Live overview</span></div>{priorities.map(item=><Link href={item.href} className={item.value?"priority-row attention":"priority-row"} key={item.label}><span>{item.label}</span><strong>{item.value}</strong><i>→</i></Link>)}</section>
      <section><div className="panel-title"><h2>SALES CHANNELS HEALTH</h2><Link href="/admin/sales-channels">Manage</Link></div><div className="channel-health"><div><span className="health-dot live"/><p>Website</p><strong>{publicBikes.length} live</strong></div><div><span className="health-dot pending"/><p>AutoTrader</p><strong>0 published</strong></div><div><span className="health-dot pending"/><p>eBay</p><strong>0 published</strong></div></div></section>
      <section><div className="panel-title"><h2>STOCK STATUS BREAKDOWN</h2><Link href="/admin/stock">Explore</Link></div><div className="status-breakdown">{breakdown.map(item=><div key={item.label}><span><i style={{width:`${Math.max(5,item.value/Math.max(stock.totalStock,1)*100)}%`}}/></span><p>{item.label}</p><strong>{item.value}</strong></div>)}</div></section></div>
    <div className="admin-panels"><section><div className="panel-title"><h2>RECENT LEADS</h2><Link href="/admin/leads">View all</Link></div>{leads.map(lead=><Link href="/admin/leads" className="mini-row" key={lead.email}><b>{lead.name}</b><span>{lead.bike}</span><em>{lead.status}</em></Link>)}</section><section><div className="panel-title"><h2>STOCK SNAPSHOT</h2><Link href="/admin/stock">Manage stock</Link></div>{bikes.slice(0,4).map(bike=>{const href=isPublic(bike)?`/used-bikes/${toPublicBike(bike).slug}`:`/admin/stock?q=${encodeURIComponent(bike.registration||`${bike.make} ${bike.model}`)}`;return <Link href={href} className="mini-row" key={bike.id}><b>{bike.make} {bike.model}</b><span>{bike.mileage?`${bike.mileage.toLocaleString("en-GB")} miles`:"—"}</span><em>{money(bike.price)}</em></Link>})}</section></div>
  </AdminPage>;
}

export function AdminPage({title,sub,hint,actions,children}:{title:string;sub:string;hint?:string;actions?:React.ReactNode;children:React.ReactNode}){return <div className="admin-page"><div className="admin-heading"><div><h1>{title}</h1><p>{sub}</p>{hint&&<span className="dealer-hint">{hint}</span>}</div>{actions}</div>{children}</div>}
