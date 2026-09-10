import type { Metadata } from "next";
import { DealerPortalV4Live } from "../v4-live-client";

export const metadata: Metadata = {
  title: "My MotorGeeks Offers",
  robots: { index: false, follow: false },
};

export default function DealerMyOffersPage() {
  return <DealerPortalV4Live section="my-offers" />;
}
