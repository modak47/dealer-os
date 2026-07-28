"use client";

import Link from "next/link";
import { useEffect } from "react";

export function PurchaseDocumentActions({ stockId }: { stockId: unknown }) {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("print") === "1") {
      const timer = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(timer);
    }
  }, []);

  return <nav className="invoice-document-actions">
    <Link href={`/admin/stock/${stockId}`}>Back to stock record</Link>
    <button type="button" onClick={() => window.print()}>Print purchase invoice</button>
  </nav>;
}
