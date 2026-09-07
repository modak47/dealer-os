import type { Metadata } from "next";
import { DealerPortalV4Live } from "../v4-live-client";

export const metadata: Metadata = {
  title: "My Dealership",
  robots: { index: false, follow: false },
};

export default function DealerDealershipPage() {
  return <DealerPortalV4Live section="dealership" />;
}
