"use client";

import { useState } from "react";

export function RecoveryForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        try {
          const response = await fetch("/api/seller/recover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const data = await response.json();
          setMessage(data.message || data.error || "Please try again.");
        } catch {
          setMessage("Unable to request a link. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="mg-field">
        Email address
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={event => setEmail(event.target.value)}
        />
      </label>
      <button className="ml-button ml-button-orange" disabled={busy}>
        {busy ? "Requesting..." : "Request secure link"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
