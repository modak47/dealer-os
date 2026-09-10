import type { Metadata } from "next";
import { DealerActiveLeadsV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorGeeks Active Leads V4 Preview",
  robots: { index: false, follow: false },
};

export default function DealerActiveLeadsV4PreviewPage() {
  return <DealerActiveLeadsV4Preview />;
}
