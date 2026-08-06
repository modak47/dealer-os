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
    <path d="M16 4.5a11.4 11.4 0 0 0-9.72 17.35L4.8 27.2l5.5-1.44A11.4 11.4 0 1 0 16 4.5Z" />
    <path d="M12.02 10.72c-.24 0-.63.1-.96.45-.33.36-1.26 1.23-1.26 3 0 1.78 1.3 3.5 1.48 3.74.18.24 2.51 4.02 6.18 5.48 3.05 1.22 3.67.98 4.34.91.67-.06 2.15-.88 2.46-1.74.3-.85.3-1.58.21-1.73-.09-.15-.33-.24-.7-.42-.36-.18-2.14-1.06-2.47-1.18-.33-.12-.57-.18-.82.18-.24.36-.94 1.18-1.15 1.42-.21.24-.43.27-.79.09-.36-.18-1.52-.56-2.9-1.79a10.9 10.9 0 0 1-2.01-2.5c-.21-.36-.02-.55.16-.73.17-.16.36-.43.55-.64.18-.21.24-.36.36-.6.12-.24.06-.45-.03-.63-.09-.18-.82-1.98-1.12-2.7-.3-.7-.6-.6-.82-.61l-.71-.01Z" />
  </svg>;
}
