import type { Metadata } from "next";
import { DealerPortalV4Live } from "../v4-live-client";

export const metadata: Metadata = {
  title: "Lost and Returned Dealer Leads",
  robots: { index: false, follow: false },
};

export default function DealerLostReturnedPage() {
  return <DealerPortalV4Live section="lost" />;
}
