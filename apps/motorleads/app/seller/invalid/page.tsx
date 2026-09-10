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
        <p>For privacy, MotorGeeks seller links expire and cannot be guessed. Start a new valuation or contact MotorGeeks if you need help.</p>
        <Link href="/valuation">Start a new valuation</Link>
      </div>
    </section>
  </PageShell>;
}
