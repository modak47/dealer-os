import type { Metadata } from "next";
import { DealerPortalV4Live } from "./v4-live-client";

export const metadata: Metadata = {
  title: "MotorGeeks Dealer Buying Portal",
  description: "Review and claim MotorGeeks motorcycle buying opportunities.",
  robots: { index: false, follow: false },
};

export default function DealerPortalPage() {
  return <DealerPortalV4Live section="dashboard" />;
}
