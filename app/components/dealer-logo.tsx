import Link from "next/link";
import { dealership } from "@/config/dealership";

export function DealerLogo({ admin = false }: { admin?: boolean }) {
  if (admin) {
    return <Link href="/admin/dashboard" className="logo yesmoto-logo admin-brand-logo" aria-label="YesMoto DealerOS dashboard">
      <img className="brand-logo-full" src="/yesmoto-logo.png" alt="YesMoto"/>
      <img className="brand-logo-mark" src="/favicon-yesmoto.png" alt=""/>
    </Link>;
  }

  return <Link href="/" className="logo yesmoto-logo" aria-label={`${dealership.dealerName} home`}>
    <img className="brand-logo-full" src="/yesmoto-logo.png" alt="YesMoto"/>
  </Link>;
}
