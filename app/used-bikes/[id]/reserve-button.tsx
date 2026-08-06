"use client";

import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ReservationAddon } from "@/lib/reservation-addons";

const cleanPhone = (value: string) => value.trim().replace(/\s+/g, " ");
const reservationFee = 99;
const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
const steps = ["Details", "Warranty", "Delivery", "Review & Pay"];

export function ReserveButton({ bikeId, slug, bike, price = 0, className = "", label = "Reserve online for \u00a399" }: { bikeId: string; slug: string; bike: string; price?: number; className?: string; label?: string }) {
  const owner = useId();
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
    <form onSubmit={submit}>
      <header><div><span>SECURE ONLINE RESERVATION</span><h2>Reserve {bike}</h2><p>Build your reservation, choose any extras, then pay the {money(reservationFee)} reservation fee securely through Stripe.</p></div><button type="button" aria-label="Close" onClick={closeModal} disabled={busy}><CloseIcon /></button></header>
      <div className="reservation-progress">{steps.map((item, index) => <button type="button" key={item} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => { if (index < step) setStep(index); }} disabled={busy || index > step}><b>{index + 1}</b><span>{item}</span></button>)}</div>
      {step === 0 && <section className="reservation-step reservation-details-step"><h3>Your details</h3><div className="reservation-form-grid"><label><span>First name</span><input value={firstName} onChange={event => setFirstName(event.target.value)} autoComplete="given-name" /></label><label><span>Last name</span><input value={lastName} onChange={event => setLastName(event.target.value)} autoComplete="family-name" /></label><label><span>Email</span><input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" /></label><label><span>Phone</span><input value={phone} onChange={event => setPhone(event.target.value)} type="tel" inputMode="tel" autoComplete="tel" /></label></div></section>}
      {step === 1 && <WarrantyStep addons={warranty} selected={selectedWarrantyId} onSelect={setSelectedWarranty} loading={addonsLoading} />}
      {step === 2 && <AddonStep title="Delivery Options" subtitle="Choose how you would like to receive your motorcycle." addons={delivery} selected={selectedDeliveryId} onSelect={setSelectedDelivery} loading={addonsLoading} />}
      {step === 3 && <section className="reservation-step reservation-review-step"><h3>Order summary</h3><div className="reservation-summary"><SummaryRow label={bike} value={money(Number(price || 0))} /><SummaryRow label="Reservation Fee" value={`${money(reservationFee)} Today`} highlight />{selectedAddons.map(addon => <SummaryRow key={addon.id} label={addon.name} value={`+${money(Number(addon.price || 0))}`} />)}<hr /><SummaryRow label="Total Purchase" value={money(purchaseTotal)} strong /><SummaryRow label="Pay Today" value={money(reservationFee)} strong /><SummaryRow label="Remaining Balance" value={money(remaining)} /></div><p className="reservation-payment-note">Only the {money(reservationFee)} reservation fee is charged today. Optional extras will be added to your final motorcycle invoice.</p><label className="reservation-consent"><input checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} type="checkbox" /><span>I agree to the <a href="/reserve-online" target="_blank">reservation terms</a>. The {money(reservationFee)} fee is deducted from the final purchase price.</span></label></section>}
      {error && <p className="auth-message reservation-error">{error}</p>}
      <footer className="reservation-builder-actions">{step > 0 ? <button type="button" onClick={() => setStep(current => Math.max(0, current - 1))} disabled={busy}>Back</button> : <button type="button" onClick={closeModal} disabled={busy}>Close</button>}{step < steps.length - 1 ? <button type="button" onClick={next} disabled={busy || addonsLoading}>{addonsLoading ? "Loading options..." : "Continue"}</button> : <button className={busy ? "loading" : ""} disabled={busy}>{busy ? <><i />Redirecting to Stripe...</> : `Pay ${money(reservationFee)} reservation fee`}</button>}</footer>
      <small className="reservation-secure-note">Payment details are entered securely on Stripe. YesMoto does not receive or store your card number.</small>
    </form>
  </div> : null;

  return <><button type="button" className={`${className} ${opening ? "loading" : ""}`} onClick={openModal} disabled={opening || busy}>{opening ? "Opening reservation..." : label}</button>{mounted && modal ? createPortal(modal, document.body) : null}</>;
}

function AddonStep({ title, subtitle, addons, selected, onSelect, loading }: { title: string; subtitle: string; addons: ReservationAddon[]; selected: string; onSelect: (id: string) => void; loading: boolean }) {
  return <section className="reservation-step"><h3>{title}</h3><p>{subtitle}</p>{loading ? <div className="reservation-option-loading">Loading options...</div> : <div className="reservation-option-grid">{addons.map(addon => <button type="button" key={addon.id} className={`${addon.id === selected ? "selected" : ""} ${addon.category}`} onClick={() => onSelect(addon.id)}><AddonArt addon={addon} />{addon.badge && <em>{addon.badge}</em>}<b>{addon.name}</b><small>{descriptionLead(addon.description)}</small><AddonBenefits description={addon.description} /><strong>{priceLabel(addon)}</strong></button>)}</div>}</section>;
}

function WarrantyStep({ addons, selected, onSelect, loading }: { addons: ReservationAddon[]; selected: string; onSelect: (id: string) => void; loading: boolean }) {
  return <section className="reservation-step warranty-upgrade-step"><div className="warranty-step-hero"><span>Peace of mind. Every mile.</span><h3>Protect your <em>investment.</em></h3><p>Every YesMoto motorcycle includes Elite Warranty with FREE UK Roadside Assistance as standard. Extend your cover today and keep riding with complete confidence.</p></div>{loading ? <div className="reservation-option-loading">Loading warranty options...</div> : <div className="warranty-option-grid">{addons.map(addon => <WarrantyCard addon={addon} selected={addon.id === selected} onSelect={() => onSelect(addon.id)} key={addon.id} />)}</div>}<div className="warranty-feature-strip"><span>FREE Roadside Assistance</span><span>Any VAT Garage</span><span>£1,000 Claim Limit</span><span>£75 Per Hour Labour Rate</span><span>UK Wide Cover</span></div><p className="warranty-powered">Powered by <b>Warranty<span>First</span></b></p></section>;
}

function WarrantyCard({ addon, selected, onSelect }: { addon: ReservationAddon; selected: boolean; onSelect: () => void }) {
  const isIncluded = Number(addon.price) === 0;
  const save = saveAmount(addon.badge);
  const was = save && Number(addon.price) > 0 ? Number(addon.price) + save : null;
  const monthly = Number(addon.price) > 0 ? Number(addon.price) / 10 : 0;
  return <button type="button" className={`warranty-upgrade-card ${selected ? "selected" : ""} ${isIncluded ? "included" : ""}`} onClick={onSelect}>
    {addon.badge && !isIncluded && <em>{addon.badge}</em>}
    <AddonArt addon={addon} />
    {isIncluded && <span className="warranty-included-label">Included</span>}
    <b>{warrantyTitle(addon)}</b>
    <small>{durationLabel(addon)}</small>
    <WarrantyBenefits description={addon.description} />
    {isIncluded ? <strong>Included as standard</strong> : <div className="warranty-price-panel">{was && <span>Was {money(was)}</span>}<strong>{money(Number(addon.price))}</strong><small>inc VAT</small><i>or</i><p>{save ? `Save ${money(save)}` : "Pay monthly"}<b>{money(monthly)} per month</b><span>for 10 months 0% interest with Bumper</span></p></div>}
  </button>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

function AddonBenefits({ description }: { description: string | null }) {
  const lines = (description ?? "").split(/\n+/).map(line => line.trim()).filter(Boolean).slice(1);
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

function warrantyTitle(addon: ReservationAddon) {
  return addon.name.replace(/\s+(12|24|36)\s+months?$/i, "");
}

function saveAmount(badge: string | null) {
  const match = badge?.match(/save\s*£?(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function AddonArt({ addon }: { addon: ReservationAddon }) {
  const key = `${addon.category} ${addon.name} ${addon.icon ?? ""}`.toLowerCase();
  if (addon.category === "delivery") {
    if (key.includes("nationwide") || key.includes("map")) return <span className="reservation-card-art delivery-art nationwide"><i /><b /><small /></span>;
    if (key.includes("local") || key.includes("truck")) return <span className="reservation-card-art delivery-art local"><i /><b /><small /></span>;
    return <span className="reservation-card-art collection-art"><i /><b /><small /></span>;
  }
  const level = key.includes("ultimate") || key.includes("gold") || key.includes("crown") ? "ultimate" : key.includes("plus") || key.includes("silver") || key.includes("star") ? "plus" : key.includes("essential") || key.includes("bronze") ? "essential" : "standard";
  return <span className={`reservation-card-art warranty-art ${level}`}><i /><b /><small /></span>;
}
