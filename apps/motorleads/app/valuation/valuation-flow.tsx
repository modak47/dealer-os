"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SellerPhotoControls } from "../components/seller-photo-controls";
import { sellerValidation, type SellerForm } from "../lib/seller-input";
import { MotorGeeksTick } from "../components/brand";

type FormRecord = Record<string, string | number | boolean | null | undefined | Record<string, unknown>>;
type Vehicle = FormRecord;
type Condition = FormRecord;
type Seller = FormRecord;

const steps = ["Your motorcycle", "Condition and history", "Photos", "Your contact details"];
const photoGuidance = ["Front", "Rear", "Left side", "Right side", "Dashboard", "Damage", "Service history"];
export function ValuationFlow({ initialRegistration = "" }: { initialRegistration?: string }) {
  const [step, setStep] = useState(1);
  const [registration, setRegistration] = useState(initialRegistration);
  const [vehicle, setVehicle] = useState<Vehicle>({ registration: initialRegistration });
  const [condition, setCondition] = useState<Condition>({});
  const [seller, setSeller] = useState<Seller>({ consent: false });
  const [lookup, setLookup] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState<{ reference: string; emailStatus?: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState("Loading saved answers…");
  const revision = useRef(0);
  const stopped = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<SellerForm>({});
  const acknowledged = useRef("");
  const initialLookupDone = useRef(false);
  latest.current = { currentStep: step, registration, vehicle, condition, seller };

  useEffect(() => {
    let alive = true;
    fetch("/api/valuation/draft").then(async response => {
      const payload = await response.json();
      if (!response.ok || !payload.draft) throw new Error(payload.error || "Could not restore your answers. Reload to retry.");
      if (!alive) return;
      const draft = payload.draft;
      revision.current = Number(draft.revision);
      setStep(Number(draft.current_step || 1));
      setRegistration(draft.registration || initialRegistration);
      setVehicle({ registration: draft.registration || initialRegistration, ...(draft.vehicle_snapshot || {}) });
      setCondition(draft.condition_snapshot || {});
      setSeller({ consent: false, ...(draft.seller_snapshot || {}) });
      if (draft.website_lead_id) {
        stopped.current = true;
        const resumed = await request("/api/valuation/submit", {});
        if (!alive) return;
        setSubmitted(resumed);
      }
      setSaveState("Saved");
      setHydrated(true);
    }).catch(error => { if (alive) setMessage(error.message); });
    return () => { alive = false; };
  }, [initialRegistration]);

  function enqueue<T,>(operation: () => Promise<T>): Promise<T> {
    const task = queue.current.then(operation);
    queue.current = task.catch(() => undefined);
    return task;
  }
  async function request(url: string, body: unknown, method = "POST") {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || payload.errors?.join(" ") || "Could not save. Please retry.");
    return payload;
  }
  function save(input: SellerForm) {
    return enqueue(async () => {
      if (stopped.current || acknowledged.current === JSON.stringify(input)) return;
      setSaveState("Saving…");
      try {
        const payload = await request("/api/valuation/draft", { ...input, version: revision.current }, "PATCH");
        revision.current = Number(payload.draft.revision);
        acknowledged.current = JSON.stringify(input);
        setSaveState("Saved");
      } catch (error) {
        setSaveState("Could not save — Retry");
        throw error;
      }
    });
  }
  useEffect(() => {
    if (!hydrated || busy || submitted || stopped.current) return;
    autosaveTimer.current = setTimeout(() => { void save(latest.current).catch(error => setMessage(error.message)); }, 450);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    // Queue and revision live in refs; form changes are the only save triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, busy, submitted, step, registration, vehicle, condition, seller]);

  useEffect(() => {
    if (!hydrated || initialLookupDone.current) return;
    initialLookupDone.current = true;
    if (initialRegistration && !latest.current.vehicle?.make && !stopped.current) void runLookup(initialRegistration);
    // Restore completes before the optional first lookup; subsequent lookups are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, initialRegistration]);

  const vehicleTitle = useMemo(() => [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "your motorcycle", [vehicle]);
  async function runLookup(value = registration) {
    if (!hydrated || busy || !value.trim()) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setBusy(true); setLookup("loading"); setMessage("");
    try {
      await save(latest.current);
      const payload = await enqueue(() => request("/api/valuation/lookup", { registration: value, version: revision.current }));
      revision.current = Number(payload.version);
      setLookup("success");
      setVehicle({ ...payload.vehicle, registration: payload.vehicle.registration || value });
      setRegistration(payload.vehicle.registration || value);
    } catch (error) {
      setLookup("error"); setMessage(error instanceof Error ? error.message : "We could not find your bike's details. You can add them yourself below.");
    } finally { setBusy(false); }
  }
  function next() {
    const errors = sellerValidation(latest.current, step);
    if (errors.length) { setMessage(errors.join(" ")); return; }
    setMessage(""); setStep(step + 1);
  }
  async function submit() {
    if (busy || !hydrated) return;
    const errors = sellerValidation(latest.current);
    if (errors.length) { setMessage(errors.join(" ")); return; }
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setBusy(true); setMessage("");
    try {
      // Wait for all earlier saves, then atomically submit the latest visible answers.
      const payload = await enqueue(() => request("/api/valuation/submit", { ...latest.current, version: revision.current }));
      stopped.current = true; setSubmitted(payload); setSaveState("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not send your details. Your answers are saved, so please try again.");
    } finally { setBusy(false); }
  }

  if (submitted) {
    return <section className="mg-valuation-complete">
      <div className="mg-success-icon">✓</div>
      <h1>{"You're all done!"}</h1>
      <p>Your motorcycle details are saved. We will review them before showing your bike to suitable dealers.</p>
      <article>
        <b>{vehicleTitle}</b>
        <span>{[displayValue(vehicle.year, "Year not set"), vehicle.derivative, vehicle.engineCapacity && `${vehicle.engineCapacity}cc`, vehicle.fuelType, displayValue(vehicle.colour, "Colour not set")].filter(Boolean).join(" · ")}</span>
        <strong>Reference: {submitted.reference}</strong>
      </article>
      <div className="mg-progress-cards">
        <span className="done">Profile submitted</span>
        <span>Under review</span>
        <span>Available to dealers</span>
        <span>Offers received</span>
      </div>
      <p className="mg-info">{submitted.emailStatus === "accepted" ? "Check your inbox and spam folder for the link to your motorcycle profile. You can also open your profile below." : "Your details are saved. Open your profile below, or request a new sign-in link if the email has not arrived."}</p>
      <div className="mg-complete-actions"><Link href="/seller#photos">Add more photos now</Link><Link href="/seller">Open my profile</Link><Link href="/seller/recover">Request a secure link</Link></div>
    </section>;
  }

  return <section className="mg-valuation-app">
    <header>
      <div><span>Step {step} of 4</span><h1>{steps[step - 1]}</h1></div>
      <ol>{steps.map((label, index) => <li className={index + 1 <= step ? "active" : ""} key={label}>{index + 1}</li>)}</ol>
    </header>
    <p role="status">{saveState} {saveState.startsWith("Could not") && <button type="button" onClick={() => void save(latest.current).then(() => setMessage("")).catch(error => setMessage(error.message))}>Retry save</button>}</p>
    {message && <p role="alert" className="mg-form-message">{message}</p>}
    <fieldset disabled={!hydrated || busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    {step === 1 && <div className="mg-step-grid">
      <div className="mg-form-panel">
        <h2>Your motorcycle</h2>
        <p>{"Enter your registration and we'll look up the details. You can correct anything that does not look right."}</p>
        <div className="mg-vrm-row"><span>UK</span><input aria-label="Motorcycle registration" autoComplete="off" value={registration} onChange={event => setRegistration(event.target.value.toUpperCase())} placeholder="GY26 ABC" /><button type="button" onClick={() => runLookup()}>{lookup === "loading" ? "Finding your bike…" : "Find my bike"}</button></div>
        {lookup === "success" && <div className="mg-found-box"><MotorGeeksTick /><div><b>We found your motorcycle</b><strong>{vehicleTitle}</strong><span>{[vehicle.year, vehicle.derivative, vehicle.engineCapacity && `${vehicle.engineCapacity}cc`, vehicle.fuelType, vehicle.colour, vehicle.motExpiry && `MOT ${vehicle.motExpiry}`].filter(Boolean).join(" · ")}</span></div></div>}
        {lookup === "error" && <div className="mg-warning-box">You can still continue. Open “Add or correct your bike details” below and enter what you know.</div>}
        <ManualVehicle vehicle={vehicle} setVehicle={setVehicle} />
        <Field label="Mileage (miles)" hint="Use the mileage shown on your dashboard." value={condition.mileage} set={v => setCondition({ ...condition, mileage: v })} required />
        <CountRadio label="Previous owners (if known)" hint="Owners before you. Choose 0 if you bought the bike new." value={condition.previousOwners} set={v => setCondition({ ...condition, previousOwners: v })} max={5} />
        <CountRadio label="Number of spare keys" hint="Extra keys, not including your main key." value={condition.spareKeys} set={v => setCondition({ ...condition, spareKeys: v })} max={3} />
        <Radio label="Is your name on the V5C logbook?" hint="This is your registration document. Choose No if you are selling on someone else's behalf." value={condition.registeredKeeper} set={v => setCondition({ ...condition, registeredKeeper: v })} options={[["yes", "Yes"], ["no", "No - I'm selling on their behalf"]]} />
      </div>
      <JourneySide />
    </div>}
    {step === 2 && <div className="mg-step-grid">
      <div className="mg-form-panel">
        <h2>Condition and history</h2>
        <div className="mg-two"><Select label="Overall condition" value={condition.overallCondition} set={v => setCondition({ ...condition, overallCondition: v })} options={["Excellent", "Good", ["Average", "Fair - some wear"], "Poor", ["Non-runner", "Does not run"]]} /><Select label="Service history" value={condition.serviceHistory} set={v => setCondition({ ...condition, serviceHistory: v })} options={[["Full history", "All service records available"], ["Part history", "Some service records available"], ["No history", "No service records"], ["Unknown", "Not sure"]]} /></div>
        <Radio label="Does the bike start and can it be ridden?" value={condition.running} set={v => setCondition({ ...condition, running: v })} options={[["yes", "Yes"], ["no", "No"]]} />
        <Radio label="Has an insurer ever recorded the bike as a write-off?" hint="Check any insurance or vehicle history documents. Choose Unsure if you do not know." value={condition.writtenOff} set={v => setCondition({ ...condition, writtenOff: v })} options={[["no", "No"], ["yes", "Yes"], ["unsure", "Unsure"]]} />
        {condition.writtenOff === "yes" && <Field label="Write-off category" hint="For example, Cat N or Cat S. Enter 'Not known' if you are unsure." value={condition.writeOffCategory} set={v => setCondition({ ...condition, writeOffCategory: v })} />}
        <Radio label="Is there any money still owed on finance?" value={condition.outstandingFinance} set={v => setCondition({ ...condition, outstandingFinance: v })} options={[["no", "No"], ["yes", "Yes"], ["unsure", "Unsure"]]} />
        <Radio label="Any mechanical or electrical faults?" hint="For example, starting problems, leaks or warning lights." value={condition.mechanicalFaults} set={v => setCondition({ ...condition, mechanicalFaults: v })} options={[["no", "No"], ["yes", "Yes"]]} />
        {condition.mechanicalFaults === "yes" && <TextArea label="Tell us about the faults" value={condition.faultDescription} set={v => setCondition({ ...condition, faultDescription: v })} />}
        <Radio label="Any scratches, dents, rust or damaged bodywork?" value={condition.cosmeticDamage} set={v => setCondition({ ...condition, cosmeticDamage: v })} options={[["no", "No"], ["yes", "Yes"]]} />
        {condition.cosmeticDamage === "yes" && <TextArea label="Tell us about the damage" value={condition.damageDescription} set={v => setCondition({ ...condition, damageDescription: v })} />}
        <div className="mg-three"><Field label="Last service date" value={condition.lastServiceDate} set={v => setCondition({ ...condition, lastServiceDate: v })} type="date" /><Field label="Mileage at last service" value={condition.mileageAtLastService} set={v => setCondition({ ...condition, mileageAtLastService: v })} /><Field label="MOT expiry date" value={condition.motExpiry || vehicle.motExpiry} set={v => setCondition({ ...condition, motExpiry: v })} type="date" /></div>
        <TextArea label="MOT advisories or warnings" hint="List any issues noted on your MOT certificate, even if the bike passed." value={condition.motAdvisories} set={v => setCondition({ ...condition, motAdvisories: v })} />
        <TextArea label="Accessories or changes made to the bike" hint="For example, luggage, heated grips or a replacement exhaust." value={condition.fittedExtras} set={v => setCondition({ ...condition, fittedExtras: v })} />
      </div>
      <JourneySide />
    </div>}
    {step === 3 && <div className="mg-step-grid">
      <div className="mg-form-panel">
        <h2>Add some photos</h2>
        <p>Good photos help dealers give you better offers. You can add up to 20 and continue without them if needed.</p>
        <div className="mg-photo-guidance">{photoGuidance.map(item => <span key={item}>{item}</span>)}</div>
        {hydrated && <SellerPhotoControls />}
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
        <div className="mg-consent"><input id="seller-consent" type="checkbox" checked={seller.consent === true} onChange={event => setSeller({ ...seller, consent: event.target.checked })} /> <div><label htmlFor="seller-consent">I agree to MotorGeeks sharing my motorcycle details with selected approved dealers so they can make offers.</label> <span>I have read the <Link href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link> and agree to the <Link href="/terms" target="_blank" rel="noopener noreferrer">Terms and Conditions</Link>.</span></div></div>
      </div>
      <JourneySide />
    </div>}
    <footer className="mg-step-actions">
      <button type="button" className="mg-secondary" disabled={step === 1} onClick={() => setStep(step - 1)}>Back</button>
      {step < 4 ? <button type="button" onClick={next}>Next step →</button> : <button type="button" onClick={submit}>Complete my motorcycle profile →</button>}
    </footer>
    </fieldset>
  </section>;
}

function ManualVehicle({ vehicle, setVehicle }: { vehicle: Vehicle; setVehicle: (vehicle: Vehicle) => void }) {
  return <details className="mg-manual">
    <summary>Add or correct your bike details</summary>
    <p>Use this if you have no registration, an imported bike or a private plate, or if any details are wrong.</p>
    <div className="mg-three"><Field label="Make" value={vehicle.make} set={v => setVehicle({ ...vehicle, make: v })} /><Field label="Model" value={vehicle.model} set={v => setVehicle({ ...vehicle, model: v })} /><Field label="Year" value={vehicle.year} set={v => setVehicle({ ...vehicle, year: v })} /></div>
    <div className="mg-two"><Field label="Model version (if known)" hint="The extra part of the model name, such as Sport, GT or RS." value={vehicle.derivative} set={v => setVehicle({ ...vehicle, derivative: v })} /><Field label="Engine size (cc)" value={vehicle.engineCapacity} set={v => setVehicle({ ...vehicle, engineCapacity: v })} /></div>
    <div className="mg-two"><Field label="Fuel type" value={vehicle.fuelType} set={v => setVehicle({ ...vehicle, fuelType: v })} /><Field label="Colour" value={vehicle.colour} set={v => setVehicle({ ...vehicle, colour: v })} /></div>
  </details>;
}

function JourneySide() {
  return <aside className="mg-journey-side"><h3>What happens next</h3><ul><li>We review your bike details.</li><li>Suitable approved dealers can make offers. They cannot see each other’s offers.</li><li>You choose whether to accept an offer. There is no obligation.</li></ul></aside>;
}

function Field({ label, hint, value, set, type = "text", required = false }: { label: string; hint?: string; value: unknown; set: (value: string) => void; type?: string; required?: boolean }) {
  const hintId = useId();
  return <label className="mg-field"><span><span id={`${hintId}-label`}>{label}</span>{required && <b aria-hidden="true">*</b>}</span><input type={type} required={required} aria-labelledby={`${hintId}-label`} aria-describedby={hint ? hintId : undefined} value={value == null || typeof value === "object" ? "" : String(value)} onChange={event => set(event.target.value)} />{hint && <small className="mg-field-hint" id={hintId}>{hint}</small>}</label>;
}

function TextArea({ label, hint, value, set }: { label: string; hint?: string; value: unknown; set: (value: string) => void }) {
  const hintId = useId();
  return <label className="mg-field full"><span id={`${hintId}-label`}>{label}</span>{hint && <small className="mg-field-hint" id={hintId}>{hint}</small>}<textarea aria-labelledby={`${hintId}-label`} aria-describedby={hint ? hintId : undefined} value={value == null || typeof value === "object" ? "" : String(value)} onChange={event => set(event.target.value)} /></label>;
}

function Select({ label, value, set, options }: { label: string; value: unknown; set: (value: string) => void; options: (string | [string, string])[] }) {
  const labelId = useId();
  return <label className="mg-field"><span id={labelId}>{label}</span><select aria-labelledby={labelId} value={value == null || typeof value === "object" ? "" : String(value)} onChange={event => set(event.target.value)}><option value="">Please choose</option>{options.map(option => { const [key, text] = typeof option === "string" ? [option, option] : option; return <option key={key} value={key}>{text}</option>; })}</select></label>;
}

function Radio({ label, hint, value, set, options }: { label: string; hint?: string; value: unknown; set: (value: string) => void; options: [string, string][] }) {
  const hintId = useId();
  return <fieldset className="mg-radio" aria-describedby={hint ? hintId : undefined}><legend>{label}</legend>{hint && <p className="mg-field-hint" id={hintId}>{hint}</p>}{options.map(([key, text]) => <label key={key}><input type="radio" name={label} checked={value === key} onChange={() => set(key)} /> {text}</label>)}</fieldset>;
}

function CountRadio({ label, hint, value, set, max }: { label: string; hint: string; value: unknown; set: (value: string) => void; max: number }) {
  const selected = displayValue(value, "");
  const options: [string, string][] = Array.from({ length: max + 1 }, (_, count) => [String(count), String(count)]);
  options.push([`${max + 1}+`, `${max + 1}+`], ["Not sure", "Not sure"]);
  // Keep an exact answer from an older draft visible until the customer changes it.
  if (selected && !options.some(([key]) => key === selected)) options.push([selected, `${selected} (saved answer)`]);
  return <Radio label={label} hint={hint} value={selected} set={set} options={options} />;
}

function displayValue(value: unknown, fallback: string) {
  return value === null || value === undefined || value === "" || typeof value === "object" ? fallback : String(value);
}
