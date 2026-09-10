import type { Metadata } from "next";
import { DealerPortalV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorGeeks Dealer Portal V4 Preview",
  robots: { index: false, follow: false },
};

export default function DealerPortalV4PreviewPage() {
  return <DealerPortalV4Preview />;
}
