import Link from "next/link";
import { dealership, phoneHref, whatsappHref } from "@/config/dealership";
import { DealerLogo } from "./dealer-logo";

export function Footer(){return <footer><div className="wide footer-grid">
  <div><DealerLogo/><p>Quality used motorcycles, professionally prepared in Brighton and delivered nationwide.</p><div className="social-links">{Object.entries(dealership.socialLinks).map(([name,href])=><a href={href} key={name} aria-label={name}>{name.slice(0,1).toUpperCase()}</a>)}</div></div>
  <div><h3>Motorcycles</h3><Link href="/stock">Used bikes</Link><Link href="/finance">Finance</Link><Link href="/part-exchange">Part exchange</Link><Link href="/sell-my-bike">Sell your bike</Link></div>
  <div><h3>YesMoto</h3><Link href="/about">About us</Link><Link href="/why-buy-from-yesmoto">Why buy from us</Link><Link href="/nationwide-delivery">Nationwide delivery</Link><Link href="/reserve-online">Reserve online</Link><Link href="/used-motorcycle-warranty">Warranty</Link></div>
  <div><h3>Get in touch</h3><p><a href={phoneHref}>{dealership.phone}</a><br/><a href={`mailto:${dealership.email}`}>{dealership.email}</a><br/>{dealership.address}<br/>{dealership.openingHours}</p><Link href="/contact">Contact YesMoto</Link></div>
  </div><div className="wide copyright">© 2026 {dealership.tradingName} <span>{dealership.domain}</span><span>Privacy · Cookies · Terms</span></div><a className="floating-whatsapp" href={whatsappHref} target="_blank" rel="noreferrer" aria-label="Chat with YesMoto on WhatsApp">WhatsApp</a></footer>}
