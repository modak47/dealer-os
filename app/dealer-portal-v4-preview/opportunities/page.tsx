import type { Metadata } from "next";
import { DealerOpportunitiesV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorGeeks Dealer Opportunities V4 Preview",
  robots: { index: false, follow: false },
};

export default function DealerOpportunitiesV4PreviewPage() {
  return <DealerOpportunitiesV4Preview />;
}
