import Link from "next/link";
import { dealership } from "@/config/dealership";
import { AdminPage } from "../dashboard/page";
import { Toggle } from "../stock/page";

const channels = [
  {
    name: `${dealership.dealerName} website`,
    initial: dealership.dealerName[0],
    state: "Connected",
    on: true,
    copy: "Publish stock instantly to the customer-facing YesMoto website.",
    action: { label: "Manage stock", href: "/admin/stock" },
  },
  {
    name: "Cazoo feed",
    initial: "CZ",
    state: "CSV ready",
    on: true,
    copy: "Export the current live stock in CSV format while we wait for Cazoo FTP credentials.",
    action: { label: "Download CSV", href: "/api/stock/feeds/cazoo" },
  },
  {
    name: "Auto Trader",
    initial: "AT",
    state: "Stock API pending",
    on: false,
    copy: "Vehicle lookup is connected. Creating/updating live adverts still needs Auto Trader Stock API publishing access.",
    action: { label: "Test connection", href: "/api/admin/autotrader/test" },
  },
  {
    name: "eBay Motors",
    initial: "e",
    state: "Integration pending",
    on: false,
    copy: "Create and manage eBay listings from Dealer OS once marketplace credentials and listing rules are supplied.",
    action: null,
  },
];

export default function Channels() {
  return (
    <AdminPage title="Sales channels" sub="Control where your vehicle stock is advertised.">
      <div className="channel-grid">
        {channels.map((channel) => (
          <article key={channel.name}>
            <div className="channel-head">
              <b>{channel.initial}</b>
              <Toggle on={channel.on} />
            </div>
            <h2>{channel.name}</h2>
            <span className={channel.on ? "connected" : "pending"}>{channel.state}</span>
            <p>{channel.copy}</p>
            {channel.action ? <Link href={channel.action.href}>{channel.action.label}</Link> : <button>Configure integration</button>}
          </article>
        ))}
      </div>
      <div className="integration-note">
        <b>Marketplace roadmap</b>
        <p>
          Website publishing is live now. Cazoo can be tested with the CSV export, then automated once they provide FTP host, username, password and destination path. Auto Trader needs Stock API create/update access before Dealer OS can safely add Publish/Unpublish buttons.
        </p>
      </div>
    </AdminPage>
  );
}
