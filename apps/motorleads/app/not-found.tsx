import Link from "next/link";
import { PageShell } from "./components/site-shell";

export default function NotFound() {
  return <PageShell>
    <section className="ml-page-hero compact">
      <div className="ml-shell"><span>Page not found</span><h1>That page is not here.</h1><p>The address may be incorrect or the page may have moved.</p></div>
    </section>
    <section className="ml-content-band"><div className="ml-shell ml-not-found-actions"><Link className="ml-button ml-button-blue" href="/">Back to MotorGeeks</Link><Link className="ml-button ml-button-orange" href="/valuation">Get a valuation <span>→</span></Link></div></section>
  </PageShell>;
}
