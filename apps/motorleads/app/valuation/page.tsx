import type { Metadata } from "next";
import { PageShell } from "../components/site-shell";
import { absoluteUrl } from "../site";
import { ValuationFlow } from "./valuation-flow";

export const metadata: Metadata = {
  title: "Motorcycle Valuation",
  description: "Start a MotorGeeks motorcycle valuation.",
  alternates: { canonical: absoluteUrl("/valuation") }
};

export default async function ValuationPage({ searchParams }: { searchParams: Promise<{ registration?: string }> }) {
  const params = await searchParams;
  return <PageShell>
    <ValuationFlow initialRegistration={params.registration ?? ""} />
  </PageShell>;
}
