import type { Metadata } from "next";
import { DealerPortalV4Live } from "../v4-live-client";

export const metadata: Metadata = {
  title: "Active Dealer Leads",
  robots: { index: false, follow: false },
};

export default function DealerActiveLeadsPage() {
  return <DealerPortalV4Live section="active" />;
}
