import type { Metadata } from 'next';
import Link from 'next/link';
import { absoluteUrl } from '../../site';
export const metadata: Metadata = {
  title: 'Open your secure profile',
  description: 'Use a single-use secure link to open your MotorGeeks seller profile.',
  alternates: { canonical: absoluteUrl('/seller/verify') },
  robots: { index: false, follow: false },
  // The verification page is tokenless, and its POST must retain a same-origin Origin header.
  referrer: 'same-origin',
};

export default function Verify() {
  return <main className="mg-seller-page">
    <section className="mg-seller-empty">
      <h1>Open your motorcycle profile</h1>
      <p>Choose Continue to sign in securely. This link can be used once.</p>
      <div className="mg-seller-access-actions">
        <form action="/api/seller/access" method="post">
          <button className="ml-button ml-button-orange">Continue securely</button>
        </form>
        <Link href="/seller/recover">Request a new link</Link>
      </div>
    </section>
  </main>;
}
