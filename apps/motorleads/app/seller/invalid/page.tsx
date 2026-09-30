import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../components/site-shell";

export const metadata: Metadata = {
  title: "Secure Link Expired",
  robots: { index: false, follow: false },
};

export default function InvalidSellerLinkPage() {
  return <PageShell>
    <section className="mg-seller-page">
      <div className="mg-seller-empty">
        <span>Secure access</span>
        <h1>This seller link is invalid or has expired.</h1>
        <p>For privacy, MotorGeeks seller links expire and cannot be guessed. Request a secure link or contact MotorGeeks if you need help.</p>
        <Link href="/seller/recover">Request a secure link</Link>
      </div>
    </section>
  </PageShell>;
}
