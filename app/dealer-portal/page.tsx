import type { Metadata } from "next";
import { DealerPortalClient } from "./portal-client";

export const metadata: Metadata = {
  title: "Dealer Buying Portal",
  description: "Review and claim motorcycle buying opportunities.",
};

export default function DealerPortalPage() {
  return <DealerPortalClient />;
}
