"use client";

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReservationAddon } from "@/lib/reservation-addons";

const cleanPhone = (value: string) => value.trim().replace(/\s+/g, " ");
const reservationFee = 99;
const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
const steps = ["Details", "Warranty", "Delivery", "Review & Pay"];

export function ReserveButton({ bikeId, slug, bike, price = 0, className = "", label = "Reserve online for \u00a399" }: { bikeId: string; slug: string; bike: string; price?: number; className?: string; label?: string }) {
  const owner = useId();
  const modalFormRef = useRef<HTMLFormElement | null>(null);
  const [mounted] = useState(() => typeof document !== "undefined");
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [addons, setAddons] = useState<ReservationAddon[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState("");
  const [selectedDelivery, setSelectedDelivery] = useState("");

  const warranty = useMemo(() => addons.filter(addon => addon.category === "warranty"), [addons]);
  const delivery = useMemo(() => addons.filter(addon => addon.category === "delivery"), [addons]);
  const selectedWarrantyId = selectedWarranty || (warranty.find(addon => addon.price === 0) ?? warranty[0])?.id || "";
  const selectedDeliveryId = selectedDelivery || (delivery.find(addon => addon.price === 0) ?? delivery[0])?.id || "";
  const selectedAddons = useMemo(() => [selectedWarrantyId, selectedDeliveryId].filter(Boolean).map(id => addons.find(addon => addon.id === id)).filter(Boolean) as ReservationAddon[], [addons, selectedDeliveryId, selectedWarrantyId]);
  const extrasTotal = selectedAddons.reduce((sum, addon) => sum + Number(addon.price || 0), 0);
  const purchaseTotal = Number(price || 0) + extrasTotal;
  const remaining = Math.max(0, purchaseTotal - reservationFee);

  const loadAddons = useCallback(async () => {
    setAddonsLoading(true);
    try {
      const response = await fetch("/api/reservation-addons", { cache: "no-store" });
      const result = await response.json() as { addons?: ReservationAddon[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to load reservation options.");
      setAddons(result.addons ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load reservation options.");
    } finally {
      setAddonsLoading(false);
    }
  }, []);

  useEffect(() => { const other = (event: Event) => { if ((event as CustomEvent<string>).detail !== owner) setOpen(false); }; window.addEventListener("yesmoto:reservation-open", other); return () => window.removeEventListener("yesmoto:reservation-open", other); }, [owner]);
  useEffect(() => { if (!open) return; document.body.classList.add("reservation-open"); const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setOpen(false); }; document.addEventListener("keydown", close); return () => { document.removeEventListener("keydown", close); document.body.classList.remove("reservation-open"); }; }, [open, busy]);
  useEffect(() => { const form = modalFormRef.current; if (!form) return; form.scrollTop = 0; form.querySelector(".reservation-step")?.scrollTo({ top: 0 }); }, [step]);
  function openModal() {
    setOpening(true);
    setError("");
    setStep(0);
    if (!addons.length && !addonsLoading) void loadAddons();
    window.dispatchEvent(new CustomEvent("yesmoto:reservation-open", { detail: owner }));
    requestAnimationFrame(() => { setOpen(true); setOpening(false); });
  }

  function closeModal() {
    if (!busy) setOpen(false);
  }

  function detailsError() {
    const values = { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), phone: cleanPhone(phone) };
    if (!values.firstName) return "Enter your first name.";
    if (!values.lastName) return "Enter your last name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return "Enter a valid email address.";
    if (!/^\+?[0-9 ()-]{7,20}$/.test(values.phone)) return "Enter a valid phone number, for example +447904443965.";
    return "";
  }

  function next() {
    const failure = step === 0 ? detailsError() : "";
    if (failure) { setError(failure); return; }
    setError("");
    setStep(current => Math.min(steps.length - 1, current + 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const failure = detailsError() || (!acceptedTerms ? "Please accept the reservation terms." : "");
    if (failure) { setError(failure); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim().toLowerCase(), phone: cleanPhone(phone), consent: acceptedTerms, stock_bike_id: bikeId, slug, addon_ids: selectedAddons.map(addon => addon.id) }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) { setBusy(false); setError(result.error || "Unable to start secure checkout."); return; }
      window.location.assign(result.url);
    } catch {
      setBusy(false);
      setError("Unable to contact secure checkout. Please try again.");
    }
  }

  const modal = open ? <div className="reservation-modal reservation-builder-modal" role="dialog" aria-modal="true" aria-label={`Reserve ${bike}`} onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
    <form onSubmit={submit} ref={modalFormRef}>
      <header><div><span>SECURE ONLINE RESERVATION</span><h2>Reserve {bike}</h2><p>Build your reservation, choose any extras, then pay the {money(reservationFee)} reservation fee securely through Stripe.</p></div><button type="button" aria-label="Close" onClick={closeModal} disabled={busy}><CloseIcon /></button></header>
      <div className="reservation-progress">{steps.map((item, index) => <button type="button" key={item} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => { if (index < step) setStep(index); }} disabled={busy || index > step}><b>{index + 1}</b><span>{item}</span></button>)}</div>
      {step === 0 && <section className="reservation-step reservation-details-step"><h3>Your details</h3><div className="reservation-form-grid"><label><span>First name</span><input value={firstName} onChange={event => setFirstName(event.target.value)} autoComplete="given-name" /></label><label><span>Last name</span><input value={lastName} onChange={event => setLastName(event.target.value)} autoComplete="family-name" /></label><label><span>Email</span><input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" /></label><label><span>Phone</span><input value={phone} onChange={event => setPhone(event.target.value)} type="tel" inputMode="tel" autoComplete="tel" /></label></div></section>}
      {step === 1 && <WarrantyStep addons={warranty} selected={selectedWarrantyId} onSelect={setSelectedWarranty} loading={addonsLoading} />}
      {step === 2 && <DeliveryStep addons={delivery} selected={selectedDeliveryId} onSelect={setSelectedDelivery} loading={addonsLoading} />}
      {step === 3 && <section className="reservation-step reservation-review-step"><h3>Order summary</h3><div className="reservation-summary"><SummaryRow label={bike} value={money(Number(price || 0))} /><SummaryRow label="Reservation Fee" value={`${money(reservationFee)} Today`} highlight />{selectedAddons.map(addon => <SummaryRow key={addon.id} label={addon.name} value={`+${money(Number(addon.price || 0))}`} />)}<hr /><SummaryRow label="Total Purchase" value={money(purchaseTotal)} strong /><SummaryRow label="Pay Today" value={money(reservationFee)} strong /><SummaryRow label="Remaining Balance" value={money(remaining)} /></div><p className="reservation-payment-note">Only the {money(reservationFee)} reservation fee is charged today. Optional extras will be added to your final motorcycle invoice.</p><label className="reservation-consent"><input checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} type="checkbox" /><span>I agree to the <a href="/reserve-online" target="_blank">reservation terms</a>. The {money(reservationFee)} fee is deducted from the final purchase price.</span></label></section>}
      {error && <p className="auth-message reservation-error">{error}</p>}
      <footer className="reservation-builder-actions">{step > 0 ? <button type="button" onClick={() => setStep(current => Math.max(0, current - 1))} disabled={busy}>Back</button> : <button type="button" onClick={closeModal} disabled={busy}>Close</button>}{step < steps.length - 1 ? <button type="button" onClick={next} disabled={busy || addonsLoading}>{addonsLoading ? "Loading options..." : "Continue"}</button> : <button className={busy ? "loading" : ""} disabled={busy}>{busy ? <><i />Redirecting to Stripe...</> : `Pay ${money(reservationFee)} reservation fee`}</button>}</footer>
      {(step === 0 || step === 3) && <small className="reservation-secure-note">Payment details are entered securely on Stripe. YesMoto does not receive or store your card number.</small>}
    </form>
  </div> : null;

  return <><button type="button" className={`${className} ${opening ? "loading" : ""}`} onClick={openModal} disabled={opening || busy}>{opening ? "Opening reservation..." : label}</button>{mounted && modal ? createPortal(modal, document.body) : null}</>;
}

function DeliveryStep({ addons, selected, onSelect, loading }: { addons: ReservationAddon[]; selected: string; onSelect: (id: string) => void; loading: boolean }) {
  const quote = addons.find(addon => /scotland|ireland|quote/i.test(`${addon.name} ${addon.badge ?? ""}`));
  const cards = addons.filter(addon => addon.id !== quote?.id).slice(0, 3);
  return <section className="reservation-step delivery-options-step">
    <div className="delivery-step-title"><span /> <h3>Delivery <em>Options</em></h3> <span /></div>
    <p>Choose how you would like to receive your motorcycle.</p>
    {loading ? <div className="reservation-option-loading">Loading delivery options...</div> : <>
      <div className="delivery-option-cards">{cards.map(addon => <button type="button" key={addon.id} className={`${addon.id === selected ? "selected" : ""}`} onClick={() => onSelect(addon.id)}>
        <DeliveryIcon addon={addon} />
        {addon.badge && <em>{addon.badge}</em>}
        <b>{deliveryTitle(addon)}</b>
        <small>{descriptionLead(addon.description)}</small>
        <DeliveryBenefits description={addon.description} />
        <strong>{priceLabel(addon)}{Number(addon.price) > 0 ? <span> inc VAT</span> : null}</strong>
      </button>)}</div>
      {quote ? <button type="button" className={`delivery-quote-strip ${quote.id === selected ? "selected" : ""}`} onClick={() => onSelect(quote.id)}>
        <DeliveryIcon addon={quote} />
        <div><b>{quote.name}</b><strong>{quote.badge || "Request a Quote"}</strong><small>{descriptionLead(quote.description)}</small></div>
        <DeliveryRouteMap />
        <span>Request a quote</span>
      </button> : null}
      <div className="delivery-trust-strip"><span>Fully insured</span><span>Safe & secure</span><span>5-7 day delivery</span><span>Handover included</span></div>
    </>}
  </section>;
}

function WarrantyStep({ addons, selected, onSelect, loading }: { addons: ReservationAddon[]; selected: string; onSelect: (id: string) => void; loading: boolean }) {
  return <section className="reservation-step warranty-upgrade-step"><div className="warranty-step-hero"><span>Peace of mind. Every mile.</span><h3>Protect your <em>investment.</em></h3><p>Every YesMoto motorcycle includes Elite Warranty with FREE UK Roadside Assistance as standard. Extend your cover today and keep riding with complete confidence.</p></div>{loading ? <div className="reservation-option-loading">Loading warranty options...</div> : <div className="warranty-option-grid">{addons.map(addon => <WarrantyCard addon={addon} selected={addon.id === selected} onSelect={() => onSelect(addon.id)} key={addon.id} />)}</div>}<WarrantyFeatureStrip /><p className="warranty-powered">Powered by <b>Warranty<span>First</span></b></p></section>;
}

function WarrantyCard({ addon, selected, onSelect }: { addon: ReservationAddon; selected: boolean; onSelect: () => void }) {
  const isIncluded = Number(addon.price) === 0;
  const save = saveAmount(addon.badge);
  const was = save && Number(addon.price) > 0 ? Number(addon.price) + save : null;
  const monthly = Number(addon.price) > 0 ? Number(addon.price) / 10 : 0;
  return <button type="button" className={`warranty-upgrade-card ${selected ? "selected" : ""} ${isIncluded ? "selected included" : ""}`} onClick={onSelect}>
    {addon.badge && !isIncluded && <em>{addon.badge}</em>}
    <WarrantyIcon addon={addon} />
    {isIncluded && <span className="warranty-included-label">Included</span>}
    <b>{warrantyTitle(addon)}</b>
    <small>{durationLabel(addon)}</small>
    <WarrantyBenefits description={addon.description} />
    {isIncluded ? <strong>Included as standard</strong> : <div className="warranty-price-panel">{was && <span>Was {money(was)}</span>}<strong>{money(Number(addon.price))}</strong><small>inc VAT</small><i>or</i><p>{save ? `Save ${money(save)}` : "Pay monthly"}<b>{money(monthly)} per month</b><span>for 10 months 0% interest with Bumper</span></p></div>}
  </button>;
}

const warrantyFeatures = [
  ["truck", "FREE Roadside Assistance"],
  ["garage", "Any VAT Garage"],
  ["pound", "£1,000 Claim Limit"],
  ["clock", "£75 Per Hour Labour Rate"],
  ["map", "UK Wide Cover"],
] as const;

function WarrantyFeatureStrip() {
  return <div className="warranty-feature-strip">{warrantyFeatures.map(([icon, label]) => <span key={label}><WarrantyFeatureIcon icon={icon} />{label}</span>)}</div>;
}

function WarrantyIcon({ addon }: { addon: ReservationAddon }) {
  const key = `${addon.name} ${addon.icon ?? ""}`.toLowerCase();
  const mark = Number(addon.price) === 0 ? "check" : key.includes("24") || key.includes("ultimate") || key.includes("crown") ? "double" : "plus";
  return <span className="warranty-svg-icon" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><path className="shield" d="M32 5 52 13v17c0 13.5-8.4 23.3-20 29-11.6-5.7-20-15.5-20-29V13l20-8Z" />{mark === "check" && <path className="mark" d="m22 32 7 7 15-17" />}{mark === "plus" && <path className="mark" d="M32 21v22M21 32h22" />}{mark === "double" && <><path className="mark" d="M25 22v20M15 32h20" /><path className="mark" d="M43 22v20M33 32h20" /></>}</svg></span>;
}

function WarrantyFeatureIcon({ icon }: { icon: (typeof warrantyFeatures)[number][0] }) {
  if (icon === "truck") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 30V14h24v16M31 20h7l4 6v4h-5M14 34a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm22 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM18 30h14" /></svg>;
  if (icon === "garage") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 23 24 10l18 13M12 21v19h24V21M17 40V27h14v13M17 32h14" /></svg>;
  if (icon === "pound") return <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="18" /><path d="M29 16c-6-3-12 0-10 8l2 8-5 1h15M17 25h10" /></svg>;
  if (icon === "clock") return <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="25" r="17" /><path d="M24 13v13l9 5M18 5h12" /></svg>;
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M18 8 7 13v27l11-5 12 5 11-5V8L30 13 18 8Zm0 0v27m12-22v27" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

function DeliveryBenefits({ description }: { description: string | null }) {
  const lines = (description ?? "").split(/\n+/).map(line => line.trim()).filter(Boolean);
  return lines.length ? <ul>{lines.map(line => <li key={line}>{line}</li>)}</ul> : null;
}

function WarrantyBenefits({ description }: { description: string | null }) {
  const lines = (description ?? "").split(/\n+/).map(line => line.trim()).filter(Boolean);
  return lines.length ? <ul>{lines.map(line => <li key={line}>{line}</li>)}</ul> : null;
}

function SummaryRow({ label, value, strong = false, highlight = false }: { label: string; value: string; strong?: boolean; highlight?: boolean }) {
  return <div className={`${strong ? "strong" : ""} ${highlight ? "highlight" : ""}`}><span>{label}</span><b>{value}</b></div>;
}

function descriptionLead(description: string | null) {
  return (description ?? "").split(/\n+/).map(line => line.trim()).filter(Boolean)[0] ?? "";
}

function priceLabel(addon: ReservationAddon) {
  if (Number(addon.price) === 0) return addon.category === "delivery" ? "FREE" : "Included";
  return `+${money(Number(addon.price))}`;
}

function durationLabel(addon: ReservationAddon) {
  if (addon.duration_months) return `${addon.duration_months} months`;
  return descriptionLead(addon.description);
}

function deliveryTitle(addon: ReservationAddon) {
  return addon.name.replace(/^Free Delivery Within 20 Miles$/i, "Free Delivery\nWithin 20 Miles");
}

function DeliveryIcon({ addon }: { addon: ReservationAddon }) {
  const key = `${addon.name} ${addon.icon ?? ""}`.toLowerCase();
  const kind = key.includes("collect") || key.includes("store") ? "collect" : key.includes("local") || key.includes("20") ? "local" : key.includes("quote") || key.includes("scotland") || key.includes("ireland") ? "quote" : "mainland";
  const src = kind === "collect" ? "/images/delivery-icons/click-collect.png" : kind === "local" ? "/images/delivery-icons/local-delivery.png" : kind === "quote" ? "/images/delivery-icons/quote-bike.png" : "/images/delivery-icons/mainland-delivery.png";
  return <span className={`delivery-svg-icon delivery-image-icon ${kind}`} aria-hidden="true"><img src={src} alt="" /></span>;
}

function DeliveryRouteMap() {
  return <span className="delivery-route-map" aria-hidden="true"><img src="/images/delivery-icons/quote-map.png" alt="" /></span>;
}

function warrantyTitle(addon: ReservationAddon) {
  return addon.name.replace(/\s+(12|24|36)\s+months?$/i, "");
}

function saveAmount(badge: string | null) {
  const match = badge?.match(/save\s*£?(\d+)/i);
  return match ? Number(match[1]) : 0;
}
