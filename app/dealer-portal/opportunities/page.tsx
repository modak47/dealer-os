import type { Metadata } from "next";
import { DealerPortalV4Live } from "../v4-live-client";

export const metadata: Metadata = {
  title: "Dealer Opportunities",
  robots: { index: false, follow: false },
};

export default function DealerOpportunitiesPage() {
  return <DealerPortalV4Live section="opportunities" />;
}
