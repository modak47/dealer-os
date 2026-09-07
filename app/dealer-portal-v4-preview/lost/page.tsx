import type { Metadata } from "next";
import { DealerLostReturnedV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorLeads Lost Returned V4 Preview",
  robots: { index: false, follow: false },
};

export default function DealerLostReturnedV4PreviewPage() {
  return <DealerLostReturnedV4Preview />;
}
