"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MotorGeeksTick } from "../components/brand";

type FormRecord = Record<string, string | number | boolean | null | undefined | Record<string, unknown>>;
type Vehicle = FormRecord;
type Condition = FormRecord;
type Seller = FormRecord;

const steps = ["Your motorcycle", "Condition & history", "Photos", "Offers"];
const photoGuidance = ["Front", "Rear", "Left side", "Right side", "Dashboard", "Damage", "Service history"];

export function ValuationFlow({ initialRegistration = "" }: { initialRegistration?: string }) {
  const [step, setStep] = useState(1);
  const [registration, setRegistration] = useState(initialRegistration);
  const [vehicle, setVehicle] = useState<Vehicle>({ registration: initialRegistration });
  const [condition, setCondition] = useState<Condition>({ overallCondition: "Good", serviceHistory: "Full history", running: "yes", writtenOff: "no", outstandingFinance: "no", mechanicalFaults: "no", cosmeticDamage: "no" });
  const [seller, setSeller] = useState<Seller>({ consent: true });
  const [lookup, setLookup] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<Array<Record<string, unknown>>>([]);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState<{ reference: string; secureLinkSent: boolean } | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/valuation/draft").then(r => r.json()).then(payload => {
      const draft = payload.draft;
      if (!draft) return;
      setStep(Number(draft.current_step || 1));
      setRegistration(draft.registration || initialRegistration);
      setVehicle({ registration: draft.registration || initialRegistration, ...(draft.vehicle_snapshot || {}) });
      setCondition(current => ({ ...current, ...(draft.condition_snapshot || {}) }));
      setSeller(current => ({ ...current, ...(draft.seller_snapshot || {}) }));
    }).catch(() => null);
  }, [initialRegistration]);

  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      fetch("/api/valuation/draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStep: step, registration, vehicle, condition, seller }),
      }).catch(() => null);
    }, 450);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [step, registration, vehicle, condition, seller]);

  useEffect(() => {
    if (initialRegistration) void runLookup(initialRegistration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vehicleTitle = useMemo(() => [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "your motorcycle", [vehicle]);

  async function runLookup(value = registration) {
    setLookup("loading");
    setMessage("");
    const response = await fetch("/api/valuation/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registration: value }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      setLookup("error");
      setMessage(payload.error || "We could not look up that registration. You can enter details manually.");
      setVehicle(current => ({ ...current, registration: value }));
      return;
    }
    setLookup("success");
    setVehicle({ ...payload.vehicle, registration: payload.vehicle.registration || value });
    setRegistration(payload.vehicle.registration || value);
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage("");
    const body = new FormData();
    Array.from(files).forEach(file => body.append("photos", file));
    const response = await fetch("/api/valuation/photos", { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    setUploading(false);
    if (!response.ok) {
      setMessage(payload.error || "Photo upload failed.");
      return;
    }
    setPhotos(current => [...current, ...(payload.photos || [])]);
  }

  async function submit() {
    setMessage("");
    const response = await fetch("/api/valuation/submit", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage((payload.errors || [payload.error || "Unable to submit your motorcycle profile."]).join(" "));
      return;
    }
    setSubmitted(payload);
  }

  if (submitted) {
    return <section className="mg-valuation-complete">
      <div className="mg-success-icon">✓</div>
      <h1>{"You're all done!"}</h1>
      <p>Your motorcycle profile has been submitted.</p>
      <article>
        <b>{vehicleTitle}</b>
        <span>{displayValue(vehicle.year, "Year not set")} · {displayValue(vehicle.engineCapacity || vehicle.engine, "Engine not set")} · {displayValue(vehicle.colour, "Colour not set")}</span>
        <strong>Reference: {submitted.reference}</strong>
      </article>
      <div className="mg-progress-cards">
        <span className="done">Profile submitted</span>
        <span>Under review</span>
        <span>Available to dealers</span>
        <span>Offers received</span>
      </div>
      <p className="mg-info">{submitted.secureLinkSent ? "We've emailed you a secure link to view your motorcycle profile, add photos later or check for offers." : "Your profile is saved. Email sending is not configured in this environment, so no magic link was sent."}</p>
      <div className="mg-complete-actions"><button onClick={() => setStep(3)}>Add more photos now</button><Link href="/">Back to home</Link></div>
    </section>;
  }

  return <section className="mg-valuation-app">
    <header>
      <div><span>Step {step} of 4</span><h1>{steps[step - 1]}</h1></div>
      <ol>{steps.map((label, index) => <li className={index + 1 <= step ? "active" : ""} key={label}>{index + 1}</li>)}</ol>
    </header>
    {message && <p className="mg-form-message">{message}</p>}
    {step === 1 && <div className="mg-step-grid">
      <div className="mg-form-panel">
        <h2>Your motorcycle</h2>
        <p>{"Enter your registration and we'll look up the details. You can correct anything that does not look right."}</p>
        <div className="mg-vrm-row"><span>UK</span><input value={registration} onChange={event => setRegistration(event.target.value.toUpperCase())} placeholder="GY23 FFW" /><button type="button" onClick={() => runLookup()}>{lookup === "loading" ? "Looking..." : "Look up reg"}</button></div>
        {lookup === "success" && <div className="mg-found-box"><MotorGeeksTick /><div><b>We found your motorcycle</b><strong>{vehicleTitle}</strong><span>{[vehicle.year, vehicle.engineCapacity && `${vehicle.engineCapacity}cc`, vehicle.colour, vehicle.motExpiry && `MOT ${vehicle.motExpiry}`].filter(Boolean).join(" · ")}</span></div></div>}
        {lookup === "error" && <div className="mg-warning-box">Lookup unavailable. Your progress is safe and manual entry is available.</div>}
        <ManualVehicle vehicle={vehicle} setVehicle={setVehicle} />
        <Field label="Mileage" value={condition.mileage} set={v => setCondition({ ...condition, mileage: v })} required />
        <div className="mg-two"><Field label="Previous owners" value={condition.previousOwners} set={v => setCondition({ ...condition, previousOwners: v })} /><Field label="Spare keys" value={condition.spareKeys} set={v => setCondition({ ...condition, spareKeys: v })} /></div>
        <Radio label="Are you the registered keeper?" value={condition.registeredKeeper} set={v => setCondition({ ...condition, registeredKeeper: v })} options={[["yes", "Yes"], ["no", "No - I'm selling on their behalf"]]} />
      </div>
      <JourneySide />
    </div>}
    {step === 2 && <div className="mg-step-grid">
      <div className="mg-form-panel">
        <h2>Condition & history</h2>
        <div className="mg-two"><Select label="Overall condition" value={condition.overallCondition} set={v => setCondition({ ...condition, overallCondition: v })} options={["Excellent", "Good", "Average", "Poor", "Non-runner"]} /><Select label="Service history" value={condition.serviceHistory} set={v => setCondition({ ...condition, serviceHistory: v })} options={["Full history", "Part history", "No history", "Unknown"]} /></div>
        <Radio label="Running and rideable?" value={condition.running} set={v => setCondition({ ...condition, running: v })} options={[["yes", "Yes"], ["no", "No"]]} />
        <Radio label="Has the motorcycle ever been recorded as a write-off?" value={condition.writtenOff} set={v => setCondition({ ...condition, writtenOff: v })} options={[["no", "No"], ["yes", "Yes"], ["unsure", "Unsure"]]} />
        {condition.writtenOff === "yes" && <Field label="Write-off category" value={condition.writeOffCategory} set={v => setCondition({ ...condition, writeOffCategory: v })} />}
        <Radio label="Outstanding finance?" value={condition.outstandingFinance} set={v => setCondition({ ...condition, outstandingFinance: v })} options={[["no", "No"], ["yes", "Yes"], ["unsure", "Unsure"]]} />
        <Radio label="Any mechanical faults?" value={condition.mechanicalFaults} set={v => setCondition({ ...condition, mechanicalFaults: v })} options={[["no", "No"], ["yes", "Yes"]]} />
        {condition.mechanicalFaults === "yes" && <TextArea label="Fault description" value={condition.faultDescription} set={v => setCondition({ ...condition, faultDescription: v })} />}
        <Radio label="Any cosmetic damage?" value={condition.cosmeticDamage} set={v => setCondition({ ...condition, cosmeticDamage: v })} options={[["no", "No"], ["yes", "Yes"]]} />
        {condition.cosmeticDamage === "yes" && <TextArea label="Damage description" value={condition.damageDescription} set={v => setCondition({ ...condition, damageDescription: v })} />}
        <div className="mg-three"><Field label="Last service date" value={condition.lastServiceDate} set={v => setCondition({ ...condition, lastServiceDate: v })} type="date" /><Field label="Mileage at last service" value={condition.mileageAtLastService} set={v => setCondition({ ...condition, mileageAtLastService: v })} /><Field label="MOT expiry date" value={condition.motExpiry || vehicle.motExpiry} set={v => setCondition({ ...condition, motExpiry: v })} type="date" /></div>
        <TextArea label="Previous MOT advisories" value={condition.motAdvisories} set={v => setCondition({ ...condition, motAdvisories: v })} />
        <TextArea label="Fitted extras" value={condition.fittedExtras} set={v => setCondition({ ...condition, fittedExtras: v })} />
      </div>
      <JourneySide />
    </div>}
    {step === 3 && <div className="mg-step-grid">
      <div className="mg-form-panel">
        <h2>Add some photos</h2>
        <p>Good photos help dealers give you better offers. You can add up to 20 and continue without them if needed.</p>
        <div className="mg-photo-guidance">{photoGuidance.map(item => <span key={item}>{item}</span>)}</div>
        <label className="mg-uploader"><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event => upload(event.target.files)} /><b>{uploading ? "Uploading..." : "Choose photos"}</b><small>JPG, PNG, WEBP, HEIC or HEIF. Max 15MB each.</small></label>
        <div className="mg-photo-count">{photos.length ? `${photos.length} photos added` : "No photos added yet"}</div>
        <button className="mg-secondary" type="button" onClick={() => setCondition({ ...condition, photosSkipped: true })}>Upload photos later</button>
      </div>
      <JourneySide />
    </div>}
    {step === 4 && <div className="mg-step-grid">
      <div className="mg-form-panel">
        <h2>Almost there - where should we send your offers?</h2>
        <p>We will use your details to manage your valuation and send offers from selected, verified dealers. Dealers do not see your full contact details before you accept an offer.</p>
        <div className="mg-two"><Field label="First name" value={seller.firstName} set={v => setSeller({ ...seller, firstName: v })} required /><Field label="Last name" value={seller.lastName} set={v => setSeller({ ...seller, lastName: v })} required /></div>
        <Field label="Email address" value={seller.email} set={v => setSeller({ ...seller, email: v })} type="email" required />
        <div className="mg-two"><Field label="Mobile number" value={seller.mobile} set={v => setSeller({ ...seller, mobile: v })} required /><Field label="Postcode" value={seller.postcode} set={v => setSeller({ ...seller, postcode: v.toUpperCase() })} required /></div>
        <label className="mg-consent"><input type="checkbox" checked={seller.consent === true} onChange={event => setSeller({ ...seller, consent: event.target.checked })} /> <span>I agree to the Privacy Policy and Terms. MotorGeeks may share my motorcycle/opportunity information with selected verified dealers who may make offers.</span></label>
      </div>
      <JourneySide />
    </div>}
    <footer className="mg-step-actions">
      <button type="button" className="mg-secondary" disabled={step === 1} onClick={() => setStep(step - 1)}>Back</button>
      {step < 4 ? <button type="button" onClick={() => setStep(step + 1)}>Next step →</button> : <button type="button" onClick={submit}>Complete my motorcycle profile →</button>}
    </footer>
  </section>;
}

function ManualVehicle({ vehicle, setVehicle }: { vehicle: Vehicle; setVehicle: (vehicle: Vehicle) => void }) {
  return <details className="mg-manual">
    <summary>No registration, import, private plate or wrong result? Edit details manually</summary>
    <div className="mg-three"><Field label="Make" value={vehicle.make} set={v => setVehicle({ ...vehicle, make: v })} /><Field label="Model" value={vehicle.model} set={v => setVehicle({ ...vehicle, model: v })} /><Field label="Year" value={vehicle.year} set={v => setVehicle({ ...vehicle, year: v })} /></div>
    <div className="mg-two"><Field label="Variant / engine" value={vehicle.derivative || vehicle.engineCapacity} set={v => setVehicle({ ...vehicle, derivative: v, engineCapacity: v })} /><Field label="Colour" value={vehicle.colour} set={v => setVehicle({ ...vehicle, colour: v })} /></div>
  </details>;
}

function JourneySide() {
  return <aside className="mg-journey-side"><h3>What happens next</h3><ul><li>MotorGeeks reviews your motorcycle profile.</li><li>Matched approved dealers can make blind offers.</li><li>You choose whether an offer works for you.</li></ul></aside>;
}

function Field({ label, value, set, type = "text", required = false }: { label: string; value: unknown; set: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="mg-field"><span>{label}{required && <b>*</b>}</span><input type={type} value={value == null || typeof value === "object" ? "" : String(value)} onChange={event => set(event.target.value)} /></label>;
}

function TextArea({ label, value, set }: { label: string; value: unknown; set: (value: string) => void }) {
  return <label className="mg-field full"><span>{label}</span><textarea value={value == null || typeof value === "object" ? "" : String(value)} onChange={event => set(event.target.value)} /></label>;
}

function Select({ label, value, set, options }: { label: string; value: unknown; set: (value: string) => void; options: string[] }) {
  return <label className="mg-field"><span>{label}</span><select value={value == null || typeof value === "object" ? "" : String(value)} onChange={event => set(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
}

function Radio({ label, value, set, options }: { label: string; value: unknown; set: (value: string) => void; options: [string, string][] }) {
  return <fieldset className="mg-radio"><legend>{label}</legend>{options.map(([key, text]) => <label key={key}><input type="radio" name={label} checked={value === key} onChange={() => set(key)} /> {text}</label>)}</fieldset>;
}

function displayValue(value: unknown, fallback: string) {
  return value === null || value === undefined || value === "" || typeof value === "object" ? fallback : String(value);
}
