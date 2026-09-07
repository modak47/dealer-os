import type { Metadata } from "next";
import { DealerPortalV4Live } from "../v4-live-client";

export const metadata: Metadata = {
  title: "Dealer Support",
  robots: { index: false, follow: false },
};

export default function DealerSupportPage() {
  return <DealerPortalV4Live section="support" />;
}
