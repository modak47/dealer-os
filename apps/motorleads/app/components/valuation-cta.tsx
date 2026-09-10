"use client";

import Link from "next/link";
import { useState } from "react";
import { site } from "../site";

export function ValuationCta({ compact = false }: { compact?: boolean }) {
  const [registration, setRegistration] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = new URL(site.valuationUrl, window.location.origin);
    if (registration.trim()) target.searchParams.set("registration", registration.trim().toUpperCase());
    window.location.href = target.toString();
  }

  return <form className={`ml-reg-form ${compact ? "compact" : ""}`} onSubmit={submit}>
    <span>UK</span>
    <label><span>Motorcycle registration</span><input value={registration} onChange={event => setRegistration(event.target.value)} placeholder="Enter your registration (e.g. GY23 FFW)" /></label>
    <button type="submit">Get a valuation <b>→</b></button>
    <Link href="/valuation">No registration? Enter motorcycle details manually.</Link>
  </form>;
}
