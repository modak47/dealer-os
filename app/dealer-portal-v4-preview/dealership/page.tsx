import type { Metadata } from "next";
import { DealerDealershipV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorLeads My Dealership V4 Preview",
  robots: { index: false, follow: false },
};

export default function DealerDealershipV4PreviewPage() {
  return <DealerDealershipV4Preview />;
}
