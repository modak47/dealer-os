"use client";

import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value?: string | null; label?: string }) {
  const [copied, setCopied] = useState(false);
  const disabled = !value;

  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <button type="button" className="crm-copy-button" onClick={copy} disabled={disabled} title={disabled ? "Nothing to copy" : label} aria-label={label}>
    {copied ? "Copied" : "Copy"}
  </button>;
}
