import Link from "next/link";
import { MotorGeeksLogo } from "./brand";
import { site } from "../site";

const nav = [
  ["How it works", "/how-it-works"],
  ["For Dealers", "/for-dealers"],
  ["About", "/about"],
  ["FAQ", "/faq"],
  ["Contact", "/contact"]
] as const;

export function SiteHeader() {
  return <header className="ml-header">
    <div className="ml-shell ml-header-row">
      <MotorGeeksLogo />
      <nav className="ml-desktop-nav" aria-label="Primary navigation">{nav.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</nav>
      <div className="ml-header-actions">
        <a className="ml-button ml-button-ghost" href={site.dealerLoginUrl}>Dealer Login</a>
        <a className="ml-button ml-button-orange" href={site.valuationUrl}>Get a valuation <span>→</span></a>
      </div>
      <details className="ml-mobile-menu">
        <summary aria-label="Open menu"><span /><span /><span /></summary>
        <div>{nav.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}<a href={site.dealerLoginUrl}>Dealer Login</a><a href={site.valuationUrl}>Get a valuation</a></div>
      </details>
    </div>
  </header>;
}

export function SiteFooter() {
  return <footer className="ml-footer">
    <div className="ml-shell ml-footer-grid">
      <div><MotorGeeksLogo /><p>Helping motorcycle owners connect with genuine motorcycle dealers across the UK.</p></div>
      <nav><h2>Quick links</h2>{nav.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</nav>
      <nav><h2>Seller guides</h2><Link href="/sell-my-motorbike">Sell my motorbike</Link><Link href="/motorbike-valuation">Motorbike valuation</Link><Link href="/how-to-sell-a-motorbike">How to sell a motorbike</Link><Link href="/motorcycle-brands">Motorcycle brands</Link><h2 className="ml-footer-subheading">Legal</h2><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms & Conditions</Link><Link href="/cookies">Cookies</Link></nav>
      <div><h2>Stay in touch</h2><p>Questions about selling a motorcycle or joining the dealer network?</p><Link href="/contact">Contact MotorGeeks →</Link></div>
    </div>
    <div className="ml-shell ml-footer-bottom"><p>© 2026 MotorGeeks. All rights reserved.</p><b>CONNECTING SELLERS WITH TRUSTED DEALERS.</b></div>
  </footer>;
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return <><SiteHeader /><main>{children}</main><SiteFooter /></>;
}
