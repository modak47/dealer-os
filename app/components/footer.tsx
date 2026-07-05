import Link from "next/link";
import { dealership, phoneHref } from "@/config/dealership";
import { DealerLogo } from "./dealer-logo";

export function Footer(){return <footer><div className="wide footer-grid">
  <div><DealerLogo/><p>{dealership.heroSubtitle} Nationwide delivery available.</p><div className="social-links">{Object.entries(dealership.socialLinks).map(([name,href])=><a href={href} key={name} aria-label={name}>{name.slice(0,1).toUpperCase()}</a>)}</div></div>
  <div><h3>Motorcycles</h3><Link href="/used-bikes">Used bikes</Link><Link href="/finance">Finance</Link><Link href="/part-exchange">Part exchange</Link><Link href="/sell-my-bike">Sell my bike</Link></div>
  <div><h3>Company</h3><Link href="/about">About us</Link><Link href="/contact">Contact</Link><Link href="/nationwide-delivery">Delivery</Link><Link href="/reserve-online">Reserve online</Link><Link href="/used-motorcycle-warranty">Warranty</Link></div>
  <div><h3>Get in touch</h3><p><a href={phoneHref}>{dealership.phone}</a><br/><a href={`mailto:${dealership.email}`}>{dealership.email}</a><br/>{dealership.address}<br/>{dealership.openingHours}</p></div>
  </div><div className="wide copyright">© 2026 {dealership.tradingName} <span>{dealership.domain}</span><span>Privacy · Cookies · Terms</span></div></footer>}
