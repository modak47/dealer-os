import type { Metadata } from "next";
import { DealerPortalV4Live } from "../v4-live-client";

export const metadata: Metadata = {
  title: "Purchased Dealer Leads",
  robots: { index: false, follow: false },
};

export default function DealerPurchasedLeadsPage() {
  return <DealerPortalV4Live section="purchased" />;
}
