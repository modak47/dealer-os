import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../components/site-shell";
import { absoluteUrl } from "../../site";

export const metadata: Metadata = {
  title: "Secure Link Expired",
  description: "Request a replacement secure MotorGeeks seller link.",
  alternates: { canonical: absoluteUrl("/seller/invalid") },
  robots: { index: false, follow: false },
};

export default function InvalidSellerLinkPage() {
  return <PageShell>
    <section className="mg-seller-page">
      <div className="mg-seller-empty">
        <span>Secure access</span>
        <h1>This seller link is invalid or has expired.</h1>
        <p>For your privacy, sign-in links expire. Request a new link to return to your saved motorcycle profile, or contact MotorGeeks for help.</p>
        <Link href="/seller/recover">Request a secure link</Link>
      </div>
    </section>
  </PageShell>;
}
