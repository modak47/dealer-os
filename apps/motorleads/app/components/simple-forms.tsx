"use client";

import { useState } from "react";

type FormKind = "dealer-access" | "contact";

export function ContactForm({ kind }: { kind: FormKind }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const [startedAt] = useState(() => Date.now());
  const isDealer = kind === "dealer-access";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch("/api/dealer-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, enquiryType: kind })
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setState("idle");
      setError(result.error || "Unable to send your enquiry. Please try again.");
      return;
    }
    setState("sent");
    event.currentTarget.reset();
  }

  if (state === "sent") return <div className="ml-form-success"><strong>{isDealer ? "Application received" : "Thank you"}</strong><p>{isDealer ? "Your MotorGeeks dealer application is awaiting review." : "Your message has been sent."}</p><button type="button" onClick={() => setState("idle")}>Send another message</button></div>;

  return <form className="ml-form-card" onSubmit={submit}>
    <div className="ml-form-heading"><span>{isDealer ? "Request access" : "Contact MotorGeeks"}</span><h2>{isDealer ? "Tell us about your dealership." : "How can we help?"}</h2><p>{isDealer ? "Applications are reviewed before access is approved." : "Send a message and the MotorGeeks team will review it."}</p></div>
    {isDealer && <label><span>Dealership / trading name</span><input name="dealership" autoComplete="organization" required /></label>}
    <label><span>Contact name</span><input name="name" autoComplete="name" required /></label>
    <label><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
    <label><span>Telephone</span><input name="telephone" type="tel" autoComplete="tel" required /></label>
    <label><span>Postcode</span><input name="postcode" autoComplete="postal-code" required={isDealer} /></label>
    {isDealer && <label><span>Website</span><input name="website" type="url" autoComplete="url" placeholder="https://" /></label>}
    <label className="ml-honeypot" aria-hidden="true"><span>Company website</span><input name="companyWebsite" tabIndex={-1} autoComplete="off" /></label>
    <input type="hidden" name="startedAt" value={startedAt} />
    <label className="full"><span>Message</span><textarea name="message" rows={5} placeholder={isDealer ? "Tell us what motorcycles you buy and where you operate." : "Tell us a little more."} /></label>
    <label className="full ml-consent"><input name="consent" type="checkbox" required /><span>I agree that MotorGeeks may contact me about this enquiry.</span></label>
    {error && <p className="ml-form-error">{error}</p>}
    <button className="ml-button ml-button-orange" type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending..." : isDealer ? "Submit application" : "Send message"} <span>→</span></button>
  </form>;
}
