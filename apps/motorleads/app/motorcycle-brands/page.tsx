import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs } from "../components/seo";
import { PageShell } from "../components/site-shell";
import { ValuationCta } from "../components/valuation-cta";
import { pageMetadata } from "../site";

export const metadata = pageMetadata(
  "Motorcycle Brand Selling and Valuation Guides",
  "Explore practical MotorGeeks seller guides for Honda, Yamaha, BMW, Piaggio, Suzuki, Kawasaki, Triumph, Harley-Davidson, KTM and Royal Enfield motorcycles.",
  "/motorcycle-brands"
);

const brands = [
  ["Honda", "From commuters and scooters to CB, CBR, Africa Twin and touring motorcycles.", "/sell-my-honda-motorbike", "/brand/manufacturers/honda.svg"],
  ["Yamaha", "Guidance for scooters, MT roadsters, R-series sports bikes, TRACER and Ténéré models.", "/sell-my-yamaha-motorbike", "/brand/manufacturers/yamaha.svg"],
  ["BMW Motorrad", "What to include about your BMW model, features, accessories and service history.", "/sell-my-bmw-motorcycle", "/brand/manufacturers/bmw.svg"],
  ["Piaggio", "Scooter-specific advice for Liberty, Medley, Beverly, MP3 and earlier models.", "/sell-my-piaggio-scooter", "/brand/manufacturers/piaggio.svg"],
  ["Suzuki", "Present GSX, Hayabusa, V-Strom, street-bike and scooter condition accurately.", "/sell-my-suzuki-motorbike", "/brand/manufacturers/suzuki.svg"],
  ["Kawasaki", "Prepare Ninja, Z, Versys, Vulcan and other Kawasaki models for dealer review.", "/sell-my-kawasaki-motorbike", "/brand/manufacturers/kawasaki.svg"],
  ["Triumph", "Help describing your Bonneville, Triple, Tiger, Rocket or other Triumph model.", "/sell-my-triumph-motorcycle", "/brand/manufacturers/triumph.svg"],
  ["Harley-Davidson", "What to show about your Harley's features, accessories, custom parts and records.", "/sell-my-harley-davidson", "/brand/manufacturers/harley-davidson.svg"],
  ["KTM", "Tips for describing your Duke, Adventure, RC or off-road bike and how it has been used.", "/sell-my-ktm-motorcycle", "/brand/manufacturers/ktm.svg"],
  ["Royal Enfield", "Guidance for Classic, Bullet, Meteor, 650 twins, Himalayan and newer families.", "/sell-my-royal-enfield", "/brand/manufacturers/royal-enfield.svg"]
] as const;

export default function MotorcycleBrandsPage() {
  return <PageShell>
    <Breadcrumbs items={[{ name: "Motorcycle brands", path: "/motorcycle-brands" }]} />
    <section className="ml-guide-hero ml-brand-hub-hero"><div className="ml-shell">
      <span>Motorcycle seller resources</span>
      <h1>Motorcycle brand selling guides.</h1>
      <p>Choose your motorcycle brand for simple tips on the details, photos and service records to include when selling your bike.</p>
      <Link className="ml-button ml-button-orange" href="/valuation">Get a valuation <span>→</span></Link>
    </div></section>
    <article className="ml-brand-hub-content">
      <div className="ml-shell">
        <section className="ml-brand-hub-intro">
          <div><span>Why the exact motorcycle matters</span><h2>Make and model are only the starting point.</h2></div>
          <div><p>Dealers look at your bike&apos;s model and version, age, mileage, condition, service and MOT history, features and accessories. Demand for that model also matters. Even two bikes from the same brand can need different repairs or servicing before they are sold on.</p><p>Use a brand guide to gather the details and photos for your bike. The guides help you describe it clearly; they do not give a fixed price or guarantee an offer.</p></div>
        </section>
        <section className="ml-brand-grid" aria-label="Motorcycle brand guides">{brands.map(([name, copy, href, logo]) => <article key={href}>
          <div className="ml-brand-card-head">
            <h2><Link href={href}>{name}</Link></h2>
            <div className="ml-brand-card-logo"><Image src={logo} alt={`${name} logo`} width={130} height={68} /></div>
          </div>
          <p>{copy}</p>
          <Link href={href}>Read the {name} guide <b aria-hidden="true">→</b></Link>
        </article>)}</section>
        <p className="ml-brand-trademark">Manufacturer names and logos are used only to identify the motorcycle guides. MotorGeeks is independent and is not endorsed by or affiliated with these manufacturers.</p>
        <section className="ml-brand-hub-advice">
          <div><h2>What every dealer needs to know</h2><p>Include the full model name and version, current mileage, how many keys you have, service and MOT records, and clear photos. Tell us about any faults, changes to the bike, money still owed on finance or previous accident damage. If you are unsure about something, say so.</p></div>
          <div><h2>Continue with the right guide</h2><p>Learn <Link href="/motorbike-valuation">what affects a motorbike valuation</Link>, read <Link href="/how-to-sell-a-motorbike">how to sell a motorbike in the UK</Link>, or see <Link href="/sell-my-motorbike">how selling through MotorGeeks works</Link>.</p></div>
        </section>
      </div>
    </article>
    <section className="ml-brand-registration"><div className="ml-shell"><div><span>Tell us about your bike</span><h2>Enter your registration.</h2><p>Check your bike&apos;s details, add its condition and history, and let approved dealers make you an offer.</p></div><ValuationCta compact /></div></section>
  </PageShell>;
}
