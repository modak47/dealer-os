import type { Metadata } from "next";
import { DealerPortalV4Live } from "../v4-live-client";

export const metadata: Metadata = {
  title: "Dealer Payments",
  robots: { index: false, follow: false },
};

export default function DealerPaymentsPage() {
  return <DealerPortalV4Live section="payments" />;
}
