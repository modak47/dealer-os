import type { Metadata } from "next";
import { DealerPortalV4Live } from "./v4-live-client";

export const metadata: Metadata = {
  title: "Dealer Buying Portal",
  description: "Review and claim motorcycle buying opportunities.",
};

export default function DealerPortalPage() {
  return <DealerPortalV4Live section="dashboard" />;
}
