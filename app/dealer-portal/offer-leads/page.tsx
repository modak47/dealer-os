import type { Metadata } from "next";
import { DealerPortalV4Live } from "../v4-live-client";

export const metadata: Metadata = {
  title: "MotorGeeks Offer Leads",
  robots: { index: false, follow: false },
};

export default function DealerOfferLeadsPage() {
  return <DealerPortalV4Live section="offer-leads" />;
}
