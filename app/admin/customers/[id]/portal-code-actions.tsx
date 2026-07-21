"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyButton } from "./copy-button";

export function PortalCodeActions({ customerId, email, initialCode }: { customerId: string; email: string | null; initialCode: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode || "");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const portalLogin = [email && `Email: ${email}`, code && `Portal code: ${code}`, "Portal: /portal"].filter(Boolean).join("\n");
  const smsMessage = `Your YesMoto customer portal is ready: /portal Email: ${email || "your email"} Portal code: ${code || "pending"}`;

  async function regenerate() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/crm/customers/${customerId}/portal-code`, { method: "POST" });
      const result = await response.json() as { customer?: { portal_access_code?: string | null }; error?: string };
      if (!response.ok || !result.customer?.portal_access_code) throw new Error(result.error || "Unable to regenerate portal code.");
      setCode(result.customer.portal_access_code);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to regenerate portal code.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail() {
    if (sending) return;
    setSending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/crm/customers/${customerId}/portal-email`, { method: "POST" });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to send portal details.");
      setMessage(result.message || "Portal details sent.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send portal details.");
    } finally {
      setSending(false);
    }
  }

  return <div className="crm-portal-tools">
    <div className="crm-copy-row">
      <p><b>Portal code:</b> {code || "Run portal migration"}</p>
      <CopyButton value={code} label="Copy portal code" />
    </div>
    <div className="crm-profile-actions">
      <Link href="/portal" target="_blank">Open customer portal</Link>
      <CopyButton value={portalLogin} label="Copy portal login details" />
      <CopyButton value={smsMessage} label="Copy SMS or WhatsApp message" />
      <button type="button" onClick={sendEmail} disabled={sending || !email || !code}>{sending ? "Sending..." : "Email details"}</button>
      <button type="button" onClick={regenerate} disabled={busy}>{busy ? "Regenerating..." : "Regenerate code"}</button>
    </div>
    {message && <p className="crm-inline-success">{message}</p>}
    {error && <p className="crm-inline-error">{error}</p>}
  </div>;
}
