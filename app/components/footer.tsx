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
    <path fill="currentColor" d="M16 3.5A12.2 12.2 0 0 0 5.35 21.64L3.75 28.5l7.02-1.54A12.2 12.2 0 1 0 16 3.5Zm0 2.25a9.95 9.95 0 0 1 8.3 15.43A9.94 9.94 0 0 1 11.16 24.7l-.43-.22-4.07.9.93-3.98-.27-.45A9.95 9.95 0 0 1 16 5.75Zm-4.15 4.5c-.21 0-.56.08-.85.4-.3.32-1.13 1.1-1.13 2.68 0 1.58 1.16 3.1 1.32 3.33.16.21 2.24 3.58 5.58 4.88 2.77 1.08 3.34.86 3.94.8.6-.05 1.95-.8 2.22-1.57.27-.77.27-1.43.19-1.57-.08-.13-.3-.21-.63-.38-.33-.16-1.95-.96-2.25-1.07-.3-.1-.52-.16-.74.16-.22.33-.85 1.07-1.04 1.29-.19.22-.38.25-.71.08-.33-.16-1.38-.51-2.63-1.62a9.85 9.85 0 0 1-1.82-2.27c-.19-.33-.02-.5.15-.67.15-.15.33-.38.49-.57.16-.19.22-.33.33-.55.1-.22.05-.41-.03-.57-.08-.16-.74-1.78-1.02-2.43-.27-.64-.54-.55-.74-.56l-.64-.01Z"/>
  </svg>;
}
