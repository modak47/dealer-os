import type { Metadata } from "next";
import Link from "next/link";
import { MotorGeeksLogo } from "../components/brand";
import { formatRegistration } from "../lib/text";
import { sellerLeadFromSession } from "../lib/marketplace";
import { SellerPhotoControls, SellerPhotoSummary } from "../components/seller-photo-controls";
import { AcceptOfferButton } from "./accept-offer-button";
import { absoluteUrl } from "../site";

export const metadata: Metadata = {
  title: "My Motorcycle Profile",
  description: "Secure MotorGeeks seller profile.",
  alternates: { canonical: absoluteUrl("/seller") },
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
        <p>Use your latest secure link or request a replacement to return to the same profile.</p>
        <Link href="/seller/recover">Request a secure link</Link>
      </div>
    </main>;
  }

  const lead = context.lead as Record<string, unknown>;
  const offers = context.offers as Array<Record<string, unknown> & { dealer?: { trading_name?: string | null } | null }>;
  const accepted = offers.find(offer => offer.status === "accepted");
  const currentOffers = offers.filter(offer => ["submitted", "viewed", "accepted"].includes(String(offer.status)));
  const status = sellerStatus(String(lead.marketplace_status || "submitted"), currentOffers.length > 0);
  return <main className="mg-seller-portal">
    <aside>
      <MotorGeeksLogo />
      <nav>
        <a href="#motorcycle">My motorcycle</a>
        <a href="#photos">Photos</a>
        <a href="#offers">Offers</a>
        <a href="#help">Help</a>
        <form action="/api/seller/logout" method="post"><button type="submit">Sign out</button></form>
      </nav>
    </aside>
    <section>
      <header className="mg-seller-header">
        <div>
          <span>MotorGeeks seller profile</span>
          <h1>Your {String(lead.make || "motorcycle")} {String(lead.model || "")}</h1>
          <p>{formatRegistration(lead.reg)} · {String(lead.year || "Year not set")} · {lead.mileage ? `${Number(lead.mileage).toLocaleString("en-GB")} miles` : "Mileage not set"}</p>
        </div>
        <b>{status.label}</b>
      </header>

      <div className={`mg-seller-notice ${accepted ? "accepted" : ""}`}>
        <strong>{accepted ? "Your offer has been accepted" : status.heading}</strong>
        <p>{accepted ? "The selected dealer can now contact you to confirm the motorcycle, payment and handover arrangements." : status.copy}</p>
      </div>

      <div className="mg-status-rail">
        <article className="done"><b>Profile</b><span>Submitted</span></article>
        <SellerPhotoSummary initialCount={context.photos.length} rail />
        <article className={currentOffers.length ? "done" : ""}><b>Offers</b><span>{currentOffers.length ? `${currentOffers.length} received` : "Waiting for dealers"}</span></article>
      </div>

      <section className="mg-seller-card" id="motorcycle">
        <h2>My motorcycle</h2>
        <dl>
          <div><dt>Registration</dt><dd>{formatRegistration(lead.reg)}</dd></div>
          <div><dt>Make/model</dt><dd>{[lead.make, lead.model].filter(Boolean).join(" ") || "Not set"}</dd></div>
          <div><dt>Year</dt><dd>{String(lead.year || "Not set")}</dd></div>
          <div><dt>Engine</dt><dd>{String(lead.engine || "Not set")}</dd></div>
          <div><dt>Mileage</dt><dd>{lead.mileage ? `${Number(lead.mileage).toLocaleString("en-GB")} miles` : "Not set"}</dd></div>
          <div><dt>Condition</dt><dd>{String(lead.bike_condition || "Not set")}</dd></div>
          <div><dt>History</dt><dd>{String(lead.service || lead.history || "Not set")}</dd></div>
          <div><dt>Colour</dt><dd>{String(lead.colour || "Not set")}</dd></div>
          <div><dt>MOT</dt><dd>{String(lead.mot || "Not returned")}</dd></div>
        </dl>
      </section>

      <section className="mg-seller-card" id="photos">
        <h2>Photos</h2>
        <SellerPhotoSummary initialCount={context.photos.length} />
        <SellerPhotoControls endpoint="/api/seller/photos" />
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
            {offer.status === "accepted" ? <p className="mg-offer-next">The dealer will contact you using the details on your profile.</p> : <AcceptOfferButton offerId={String(offer.id)} disabled={Boolean(accepted)} />}
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

function sellerStatus(value: string, hasOffers: boolean) {
  if (value === "purchased") return { label: "Purchased", heading: "Your motorcycle purchase is complete", copy: "The selected dealer has confirmed the purchase. Contact MotorGeeks if you need help with this completed profile." };
  if (value === "purchase_pending") return { label: "Purchase pending", heading: "Your purchase is being completed", copy: "The selected dealer can contact you to confirm payment, collection and handover arrangements." };
  if (value === "offer_accepted") return { label: "Offer accepted", heading: "Your chosen dealer is ready for the next step", copy: "The dealer can now contact you to arrange the purchase and handover." };
  if (value === "offer_received" || hasOffers) return { label: "Offers received", heading: "You have a dealer offer to review", copy: "Compare the offer details below. You remain in control and do not have to accept an offer." };
  if (value === "live_to_dealers") return { label: "Available to dealers", heading: "Your motorcycle is with matched dealers", copy: "Approved dealers can review the motorcycle details and make blind offers. We will show any offers here." };
  if (value === "under_review") return { label: "Under review", heading: "MotorGeeks is reviewing your profile", copy: "We are checking the motorcycle details before matching it with suitable approved dealers." };
  if (value === "cancelled") return { label: "Closed", heading: "This marketplace profile is closed", copy: "Contact MotorGeeks if you think this status is incorrect or you need help." };
  return { label: "Profile submitted", heading: "Your motorcycle profile has been received", copy: "MotorGeeks will review the details before matching it with suitable approved dealers." };
}
