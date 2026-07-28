"use client";

import Link from "next/link";
import { useEffect } from "react";

export function PurchaseDocumentActions({ stockId, sellerEmail, subject }: { stockId: unknown; sellerEmail?: string; subject: string }) {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("print") === "1") {
      const timer = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(timer);
    }
  }, []);

  return <nav className="invoice-document-actions">
    <Link href={`/admin/stock/${stockId}`}>Back to stock record</Link>
    {sellerEmail && <a href={`mailto:${encodeURIComponent(sellerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent("Hi,\n\nPlease find the purchase invoice for your motorcycle attached.\n\nKind regards,\nYesMoto")}`}>Email seller</a>}
    <button type="button" onClick={() => window.print()}>Print purchase invoice</button>
  </nav>;
}
