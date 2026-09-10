import Link from "next/link";
import { MotorGeeksTick } from "./brand";
import { Icon } from "./icons";
import { ValuationCta } from "./valuation-cta";
import { site } from "../site";

export const steps = [
  ["Tell us about your motorcycle", "Enter your registration and answer a few simple questions.", "form"],
  ["Add condition and photos", "Clear details help interested dealers understand your bike.", "camera"],
  ["We match suitable dealers", "Your motorcycle can be reviewed by relevant verified dealers.", "users"],
  ["Connect with a buyer", "An interested dealer can claim the opportunity and contact you.", "handshake"]
] as const;

export const faqs = [
  ["Is the valuation really free?", "Yes. There is no charge to submit your motorcycle details and no obligation to proceed."],
  ["Do I have to accept anything?", "No. MotorGeeks helps introduce your motorcycle to suitable dealers. You stay in control of whether to continue."],
  ["How do I know dealers are genuine?", "MotorGeeks is built around approved motorcycle dealers, not anonymous classified enquiries."],
  ["How does collection work?", "If a dealer buys your motorcycle, collection or handover arrangements are agreed directly with you."]
];

export function Hero() {
  return <section className="ml-hero">
    <div className="ml-shell ml-hero-grid">
      <div className="ml-hero-copy">
        <h1>Sell your motorcycle with <span>MotorGeeks</span></h1>
        <p>Connect your motorcycle with trusted motorcycle dealers across the UK.</p>
        <ValuationCta />
      </div>
      <div className="ml-handwritten"><b>More dealer interest<br />can mean a better sale.</b><span /><em><MotorGeeksTick />Quick<br /><MotorGeeksTick />Simple<br /><MotorGeeksTick />No obligation</em></div>
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
        <div className="ml-proof-rating"><b>Trusted motorcycle network</b><span>Dealer logos and independent review ratings will be shown once final commercial approvals and verified sources are in place.</span></div>
        <div className="ml-proof-cards"><article><Icon name="shield" /><b>Verified dealer network</b><p>Approved buyers only.</p></article><article><Icon name="bike" /><b>Motorcycle-specific</b><p>Built around bike details, photos, MOT and condition.</p></article><article><Icon name="lock" /><b>Secure by design</b><p>Contact details are protected until the right point in the process.</p></article></div>
      </div>
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
      <div className="ml-faq-grid">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
    </div>
  </section>;
}
