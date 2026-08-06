import Link from "next/link";
import { dealership } from "@/config/dealership";
import { dealerAddress, getDealerSettings } from "@/lib/dealer-settings";
import { DealerLogo } from "./dealer-logo";

export async function Footer() {
  const settings = await getDealerSettings();
  const phone = settings.website_contact_phone || settings.phone;
  const email = settings.website_contact_email || settings.email;
  const whatsapp = settings.website_whatsapp || settings.whatsapp_number || phone;
  const phoneHref = `tel:${phone.replace(/\D/g, "")}`;
  const whatsappHref = `https://wa.me/${whatsapp.replace(/^0/, "44").replace(/\D/g, "")}`;

  return <footer>
    <div className="wide footer-grid">
      <div><DealerLogo /><p>Quality used motorcycles, professionally prepared in Brighton and delivered nationwide.</p><div className="social-links">{Object.entries(dealership.socialLinks).map(([name, href]) => <a href={href} key={name} aria-label={name}>{name.slice(0, 1).toUpperCase()}</a>)}</div></div>
      <div><h3>Motorcycles</h3><Link href="/stock">Used bikes</Link><Link href="/finance">Finance</Link><Link href="/part-exchange">Part exchange</Link><Link href="/sell-my-bike">Sell your bike</Link></div>
      <div><h3>{settings.business_name}</h3><Link href="/about">About us</Link><Link href="/why-buy-from-yesmoto">Why buy from us</Link><Link href="/nationwide-delivery">Nationwide delivery</Link><Link href="/reserve-online">Reserve online</Link><Link href="/used-motorcycle-warranty">Warranty</Link></div>
      <div><h3>Get in touch</h3><p><a href={phoneHref}>{phone}</a><br /><a href={`mailto:${email}`}>{email}</a><br />{dealerAddress(settings)}<br />{settings.opening_hours}</p><Link href="/contact">Contact {settings.business_name}</Link></div>
    </div>
    <div className="wide copyright">© 2026 {settings.legal_name || settings.trading_name} <span>{settings.website}</span><span>Privacy · Cookies · Terms</span></div>
    <a className="floating-whatsapp" href={whatsappHref} target="_blank" rel="noreferrer" aria-label={`Chat with ${settings.business_name} on WhatsApp`}><WhatsAppIcon /><span>WhatsApp</span></a>
  </footer>;
}

function WhatsAppIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M16.02 3.2A12.63 12.63 0 0 0 5.06 22.1L3.4 28.8l6.86-1.6A12.63 12.63 0 1 0 16.02 3.2Zm0 2.5a10.13 10.13 0 0 1 8.62 15.46 10.12 10.12 0 0 1-13.2 3.5l-.42-.22-4.1.96.98-4-.25-.43A10.13 10.13 0 0 1 16.02 5.7Zm-4.2 4.62c-.25 0-.65.1-.99.48-.34.37-1.3 1.27-1.3 3.1s1.33 3.59 1.52 3.84c.18.24 2.57 4.12 6.37 5.6 3.16 1.24 3.8.99 4.48.93.69-.06 2.22-.91 2.54-1.79.31-.88.31-1.63.22-1.79-.1-.15-.34-.24-.72-.43-.37-.19-2.22-1.1-2.56-1.22-.34-.13-.59-.19-.84.18-.25.38-.97 1.22-1.19 1.47-.22.25-.44.28-.81.1-.38-.19-1.58-.58-3-1.85a11.25 11.25 0 0 1-2.08-2.59c-.22-.37-.02-.57.17-.76.17-.17.37-.44.56-.66.18-.22.25-.38.37-.63.13-.25.07-.47-.03-.66-.1-.19-.84-2.02-1.15-2.77-.3-.72-.61-.62-.84-.63h-.72Z" />
  </svg>;
}
