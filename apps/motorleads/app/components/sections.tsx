import Link from "next/link";
import { MotorGeeksTick } from "./brand";
import { Icon } from "./icons";
import { ValuationCta } from "./valuation-cta";
import { site } from "../site";
import { preload } from "react-dom";

export const steps = [
  ["Tell us about your motorcycle", "Enter your registration and answer a few simple questions.", "form"],
  ["Add condition and photos", "Clear details help interested dealers understand your bike.", "camera"],
  ["We match suitable dealers", "Your motorcycle can be reviewed by relevant verified dealers.", "users"],
  ["Choose an offer", "Compare dealer offers and decide whether one works for you.", "handshake"]
] as const;

export const faqs = [
  ["How does MotorGeeks work?", "Enter your registration or motorcycle details, describe its condition and add clear photos. MotorGeeks can then introduce the motorcycle to approved dealers, who may make offers for you to consider."],
  ["How is my motorbike valued?", "MotorGeeks does not promise a fixed price. Dealers consider the motorcycle's age, model, mileage, condition, service history, MOT status, photographs and current demand before deciding whether to make an offer."],
  ["Do I have to accept an offer?", "No. Submitting your motorcycle is free and does not oblige you to accept an offer. You decide whether an offer works for you."],
  ["Can I sell a motorbike with outstanding finance?", "You should disclose any outstanding finance. A buying dealer may require it to be settled as part of the transaction, and you should confirm the settlement process with your finance provider and the dealer."],
  ["Can I sell a motorcycle without an MOT?", "You can still submit a motorcycle without a current MOT. Its MOT status and any known faults may affect dealer interest and the offers you receive."],
  ["What photos should I upload?", "Include clear photographs of the front, rear, both sides, dashboard or mileage, service history and any damage. Honest, well-lit photos help dealers assess the motorcycle accurately."],
  ["Does mileage affect my motorbike's value?", "Mileage is one factor dealers consider alongside age, condition, maintenance, ownership history, specification and demand. A well-maintained higher-mileage bike may still attract interest."],
  ["What happens after I accept a dealer offer?", "The successful dealer receives the contact details needed to discuss the motorcycle, confirm its condition and arrange payment and collection or handover. The sale is completed directly with that dealer."],
  ["Who buys my motorcycle?", "MotorGeeks introduces your motorcycle to approved motorcycle dealers. The dealer whose offer you accept is the prospective buyer."],
  ["Does MotorGeeks buy the motorcycle?", "No. MotorGeeks operates the introduction and offer platform. Any purchase is made by the dealer, subject to the dealer's final checks and agreement with you."]
];

export function Hero() {
  preload("/images/motorleads-hero-scenic.jpg", { as: "image", fetchPriority: "high" });
  return <section className="ml-hero">
    <div className="ml-shell ml-hero-grid">
      <div className="ml-hero-copy">
        <h1>Sell your motorbike with <span>MotorGeeks</span></h1>
        <p>Enter your registration, add your motorcycle details and receive offers from approved dealers across the UK.</p>
        <ValuationCta />
      </div>
      <div className="ml-handwritten">
        <b>More dealer interest can mean a better sale.</b>
        <span />
        <em><MotorGeeksTick />Quick</em>
        <em><MotorGeeksTick />Simple</em>
        <em><MotorGeeksTick />No obligation</em>
      </div>
    </div>
  </section>;
}

export function TrustStrip() {
  return <section className="ml-trust-strip">
    <div className="ml-shell">
      <article><Icon name="pound" /><div><b>Free valuation</b><span>No obligation</span></div></article>
      <article><Icon name="shield" /><div><b>Trusted dealers</b><span>Approved motorcycle buyers</span></div></article>
      <article><Icon name="network" /><div><b>UK-wide network</b><span>England, Scotland and Wales</span></div></article>
      <article><Icon name="lock" /><div><b>Your details are secure</b><span>Customer details stay protected</span></div></article>
    </div>
  </section>;
}

export function HowItWorksSection({ full = false }: { full?: boolean }) {
  return <section className="ml-process">
    <div className="ml-shell ml-process-grid">
      <div className="ml-section-intro">
        <span>How it works</span>
        <h2>Sell your motorcycle in four simple steps.</h2>
        <p>Tell us about your bike, add useful details and photos, and MotorGeeks can match it with suitable motorcycle dealers.</p>
        {!full && <Link className="ml-button ml-button-orange" href={site.valuationUrl}>Get a free valuation <span>→</span></Link>}
        <b className="ml-scribble">It’s quick, simple and built for bikes.</b>
      </div>
      <div className="ml-step-row">{steps.map(([title, copy, icon], index) => <article key={title}>
        <i>{index + 1}</i>
        <Icon name={icon} />
        <h3>{title}</h3>
        <p>{copy}</p>
      </article>)}</div>
    </div>
  </section>;
}

export function WhySection() {
  const benefits = [
    ["Genuine dealers", "No classified tyre-kickers or anonymous messages.", "shield"],
    ["Save time", "Relevant dealers can come to you.", "clock"],
    ["UK-wide network", "Reach motorcycle buyers beyond your local area.", "pin"],
    ["No obligation", "You choose whether to continue.", "star"]
  ] as const;
  return <section className="ml-why">
    <div className="ml-shell ml-why-grid">
      <div><span>Why MotorGeeks</span><h2>A safer, smarter way to sell your motorcycle.</h2><p>We help motorcycle owners avoid the usual selling hassle by connecting their bike with suitable, genuine dealers.</p><Link className="ml-button ml-button-blue" href="/about">Learn more <span>→</span></Link></div>
      <div>{benefits.map(([title, copy, icon]) => <article key={title}><Icon name={icon} /><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div>
      <b className="ml-why-note">Sell with confidence.</b>
    </div>
  </section>;
}

export function DealerProofSection() {
  return <section className="ml-proof">
    <div className="ml-shell">
      <div><span>Built for trust</span><h2>A motorcycle-first way to reach genuine buyers.</h2><p>MotorGeeks is shaped around the information dealers actually need: bike details, condition, photos, history and location.</p></div>
      <div className="ml-proof-panel">
        <div className="ml-proof-cards"><article><Icon name="shield" /><b>Verified dealer network</b><p>Approved buyers only.</p></article><article><Icon name="bike" /><b>Motorcycle-specific</b><p>Built around bike details, photos, MOT and condition.</p></article><article><Icon name="lock" /><b>Secure by design</b><p>Contact details are protected until the right point in the process.</p></article></div>
      </div>
    </div>
  </section>;
}

export function SellerGuidesSection() {
  const guides = [
    ["Sell my motorbike", "Understand the MotorGeeks offer process and what happens from registration to dealer collection.", "/sell-my-motorbike"],
    ["Motorbike valuation guide", "See what can affect motorcycle value and how accurate details help dealers assess your bike.", "/motorbike-valuation"],
    ["How to sell a motorbike", "Prepare your motorcycle, documents and photos before agreeing a sale with a dealer.", "/how-to-sell-a-motorbike"]
  ] as const;
  return <section className="ml-guides-band">
    <div className="ml-shell">
      <div className="ml-guides-intro"><span>Seller guides</span><h2>Useful advice before you sell.</h2><p>Clear information helps you present your motorcycle accurately and understand each stage of the sale.</p></div>
      <div className="ml-guides-links">{guides.map(([title, copy, href]) => <article key={href}><h3><Link href={href}>{title}</Link></h3><p>{copy}</p><Link href={href}>Read the guide <span aria-hidden="true">→</span></Link></article>)}</div>
    </div>
  </section>;
}

export function ImageCta() {
  return <section className="ml-image-cta">
    <div className="ml-shell"><div><span>Ready to sell?</span><h2>Get your free motorcycle valuation today.</h2><p>It only takes a few minutes to start.</p><ValuationCta compact /></div><b>{site.tagline}</b></div>
  </section>;
}

export function FaqSection({ showLink = true }: { showLink?: boolean }) {
  return <section className="ml-faq-section">
    <div className="ml-shell">
      <div className="ml-faq-head"><div><span>Frequently asked questions</span><h2>Got a question?</h2><p>Find answers to the most common questions about selling your motorcycle with MotorGeeks.</p></div>{showLink && <Link href="/faq">View all FAQs →</Link>}</div>
      <div className="ml-faq-grid">{(showLink ? faqs.slice(0, 4) : faqs).map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
    </div>
  </section>;
}
