import Link from "next/link";
import { Breadcrumbs } from "../components/seo";
import { PageShell } from "../components/site-shell";
import { pageMetadata } from "../site";

export const metadata = pageMetadata(
  "Motorbike Valuation: What Is My Motorcycle Worth?",
  "Learn what affects a motorbike valuation, from mileage and condition to service history, MOT and photographs, then request dealer offers.",
  "/motorbike-valuation"
);

export default function MotorbikeValuationPage() {
  return <PageShell>
    <Breadcrumbs items={[{ name: "Motorbike valuation", path: "/motorbike-valuation" }]} />
    <section className="ml-guide-hero valuation-guide"><div className="ml-shell"><span>Motorcycle values</span><h1>How much is my motorbike worth?</h1><p>A useful motorbike valuation considers the whole motorcycle, not just its registration and age. Learn what dealers assess before you request offers.</p><Link className="ml-button ml-button-orange" href="/valuation">Start your valuation <span>→</span></Link></div></section>
    <article className="ml-guide-content"><div className="ml-shell ml-guide-grid">
      <div className="ml-guide-main">
        <section><h2>How motorcycle valuation works</h2><p>Two motorcycles of the same model and year can have different values. Mileage, condition, service history, fitted features and demand all matter. Looking up your registration can help identify your bike, but it cannot show how the bike has been maintained or what its bodywork looks like today.</p><p>MotorGeeks collects the information approved dealers need to assess a motorcycle. Dealers can then decide whether to make an offer based on the profile you submit. MotorGeeks does not promise a fixed market value, a minimum price or a guaranteed sale.</p></section>
        <section><h2>What affects a motorbike&apos;s value?</h2><dl className="ml-guide-factors"><div><dt>Make, model and version</dt><dd>Your model version, engine size, fitted features and demand for that bike can affect dealer interest. A version is the extra part of a model name, such as Sport, GT or RS.</dd></div><div><dt>Age and mileage</dt><dd>Dealers consider mileage in context. Usage, maintenance and condition can be as important as the number itself.</dd></div><div><dt>Condition and faults</dt><dd>Damage, worn tyres or brakes, warning lights and other faults can affect what a dealer needs to spend before selling the bike on.</dd></div><div><dt>Service history</dt><dd>Invoices, service records and records of regular servicing help a dealer understand how the motorcycle has been cared for.</dd></div><div><dt>MOT and vehicle history</dt><dd>A current MOT, recorded advisories, outstanding finance and other checks can influence the assessment and next steps.</dd></div><div><dt>Modifications and extras</dt><dd>Some accessories may be useful to a buyer, while extensive modifications may narrow demand. Describe standard parts that are included.</dd></div></dl></section>
        <section><h2>Why accurate photos matter</h2><p>Good photographs let a dealer assess bodywork, wheels, controls, dashboard, accessories and visible condition before making an offer. Include both sides, the front and rear, the mileage display, service records and close-ups of any damage. Avoid filters and photographs that hide part of the bike.</p><p>Photos do not replace an inspection, but they can reduce uncertainty. The clearer your details and photos, the easier it is for a dealer to make an offer that reflects the motorcycle you actually own.</p></section>
        <section><h2>Valuation, offer and final purchase are different stages</h2><p>A valuation gives an idea of what your bike could be worth. An offer is the amount a dealer is willing to pay based on your description. The sale is completed after you accept, the dealer checks the bike and you agree payment and handover.</p><p>A dealer may change their offer if important details are missing or the bike is different from your description. Keep your details up to date to help avoid surprises.</p></section>
        <section><h2>Get ready for dealer offers</h2><p>Have the registration, current mileage, number of keys, ownership details, MOT information and service records nearby. Take fresh photographs in good light and list faults plainly. You can then <Link href="/valuation">start your MotorGeeks valuation</Link>, read more about <Link href="/sell-my-motorbike">selling through trusted dealers</Link>, or use a <Link href="/motorcycle-brands">motorcycle brand guide</Link> to prepare model-specific details.</p></section>
      </div>
      <aside className="ml-guide-aside"><h2>Tell us about your bike</h2><p>Provide the details once and let approved dealers consider the motorcycle.</p><Link className="ml-button ml-button-orange" href="/valuation">Get a valuation <span>→</span></Link><Link href="/faq">Read seller questions</Link></aside>
    </div></article>
  </PageShell>;
}
