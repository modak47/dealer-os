import Link from "next/link";
import { dealership } from "@/config/dealership";

export function DealerLogo({ admin = false }: { admin?: boolean }) {
  if (admin) {
    return <Link href="/admin/dashboard" className="dealer-os-logo">Dealer<span>OS</span></Link>;
  }

  return <Link href="/" className="logo yesmoto-logo" aria-label={`${dealership.dealerName} home`}>
    <img src="/yesmoto-logo.png" alt="Yes Moto"/>
  </Link>;
}
