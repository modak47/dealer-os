import type { Metadata } from 'next';
import Link from 'next/link';
export const metadata:Metadata={title:'Open your secure profile',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function Verify(){return <main className="mg-seller-page"><section className="mg-seller-empty"><h1>Open your motorcycle profile</h1><p>Choose Continue to sign in securely. This link can be used once.</p><form action="/api/seller/access" method="post"><button className="ml-button ml-button-orange">Continue securely</button></form><Link href="/seller/recover">Request a new link</Link></section></main>;}
