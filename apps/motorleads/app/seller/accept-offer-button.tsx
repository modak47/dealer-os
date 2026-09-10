"use client";

import { useState } from "react";

export function AcceptOfferButton({ offerId, disabled }: { offerId: string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function accept() {
    setState("saving");
    setMessage("");
    const response = await fetch(`/api/seller/offers/${offerId}/accept`, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setMessage(payload.error || "That offer is no longer available.");
      return;
    }
    setState("done");
    setMessage("Offer accepted. The winning dealer can now contact you.");
    window.location.reload();
  }

  return <div className="mg-offer-action">
    <button type="button" disabled={disabled || state === "saving" || state === "done"} onClick={accept}>
      {state === "saving" ? "Accepting..." : state === "done" ? "Accepted" : "Accept offer"}
    </button>
    {message && <p className={state === "error" ? "error" : "success"}>{message}</p>}
  </div>;
}
