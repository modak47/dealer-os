import type { Metadata } from "next";
import Link from "next/link";
import { MotorGeeksLogo } from "../components/brand";
import { formatRegistration } from "../lib/text";
import { sellerLeadFromSession } from "../lib/marketplace";
import { AcceptOfferButton } from "./accept-offer-button";

export const metadata: Metadata = {
  title: "My Motorcycle Profile",
  robots: { index: false, follow: false },
};

export default async function SellerPortalPage() {
  const context = await sellerLeadFromSession();
  if (!context) {
    return <main className="mg-seller-page">
      <div className="mg-seller-empty">
        <MotorGeeksLogo />
        <span>Secure seller area</span>
        <h1>Your secure session has expired.</h1>
        <p>Use the latest MotorGeeks link from your email, or start a new valuation.</p>
        <Link href="/valuation">Start a valuation</Link>
      </div>
    </main>;
  }

  const lead = context.lead as Record<string, unknown>;
  const offers = context.offers as Array<Record<string, unknown> & { dealer?: { trading_name?: string | null } | null }>;
  const accepted = offers.find(offer => offer.status === "accepted");
  const currentOffers = offers.filter(offer => ["submitted", "viewed", "accepted"].includes(String(offer.status)));
  const status = String(lead.marketplace_status || "submitted").replace(/_/g, " ");
  return <main className="mg-seller-portal">
    <aside>
      <MotorGeeksLogo />
      <nav>
        <a href="#motorcycle">My motorcycle</a>
        <a href="#photos">Photos</a>
        <a href="#offers">Offers</a>
        <a href="#help">Help</a>
      </nav>
    </aside>
    <section>
      <header className="mg-seller-header">
        <div>
          <span>MotorGeeks seller profile</span>
          <h1>Your {String(lead.make || "motorcycle")} {String(lead.model || "")}</h1>
          <p>{formatRegistration(lead.reg)} · {String(lead.year || "Year not set")} · {lead.mileage ? `${Number(lead.mileage).toLocaleString("en-GB")} miles` : "Mileage not set"}</p>
        </div>
        <b>{status}</b>
      </header>

      <div className="mg-status-rail">
        <article className="done"><b>Profile</b><span>Submitted</span></article>
        <article className={context.photos.length ? "done" : ""}><b>Photos</b><span>{context.photos.length ? `${context.photos.length} added` : "Can add later"}</span></article>
        <article className={currentOffers.length ? "done" : ""}><b>Offers</b><span>{currentOffers.length ? `${currentOffers.length} received` : "Waiting for dealers"}</span></article>
      </div>

      <section className="mg-seller-card" id="motorcycle">
        <h2>My motorcycle</h2>
        <dl>
          <div><dt>Registration</dt><dd>{formatRegistration(lead.reg)}</dd></div>
          <div><dt>Make/model</dt><dd>{[lead.make, lead.model].filter(Boolean).join(" ") || "Not set"}</dd></div>
          <div><dt>Colour</dt><dd>{String(lead.colour || "Not set")}</dd></div>
          <div><dt>MOT</dt><dd>{String(lead.mot || "Not returned")}</dd></div>
        </dl>
      </section>

      <section className="mg-seller-card" id="photos">
        <h2>Photos</h2>
        <p>{context.photos.length ? `${context.photos.length} photos are attached to your motorcycle profile.` : "No photos have been added yet. We will still review your profile, but photos help dealers make better offers."}</p>
        {context.photos.length > 0 && <div className="mg-seller-photo-grid">
          {context.photos.map(photo => photo.signed_url ? <img src={photo.signed_url} alt={photo.photo_label || photo.original_filename || "Motorcycle photo"} key={photo.id} /> : null)}
        </div>}
      </section>

      <section className="mg-seller-card" id="offers">
        <h2>Offers</h2>
        {!currentOffers.length && <p>Your motorcycle is being reviewed or is waiting for matched dealers to make offers.</p>}
        <div className="mg-offer-list">
          {currentOffers.map(offer => <article key={String(offer.id)} className={offer.status === "accepted" ? "accepted" : ""}>
            <span>{offer.status === "accepted" ? "Accepted offer" : "Dealer offer"}</span>
            <h3>{(Number(offer.amount_pence) / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })}</h3>
            <p>{typeof offer.note === "string" && offer.note ? offer.note : "Subject to the motorcycle being as described."}</p>
            <small>{offer.dealer?.trading_name ? `${offer.dealer.trading_name} · MotorGeeks verified dealer` : "MotorGeeks verified dealer"}</small>
            <AcceptOfferButton offerId={String(offer.id)} disabled={Boolean(accepted)} />
          </article>)}
        </div>
      </section>

      <section className="mg-seller-card" id="help">
        <h2>Need help?</h2>
        <p>Contact MotorGeeks if details need correcting or if you have questions about an offer. Your personal contact details are only unlocked to the dealer whose offer you accept.</p>
        <Link href="/contact">Contact MotorGeeks</Link>
      </section>
    </section>
  </main>;
}
