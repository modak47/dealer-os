import type { Metadata } from "next";
import { DealerPaymentsV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorGeeks Payments V4 Preview",
  robots: { index: false, follow: false },
};

export default function DealerPaymentsV4PreviewPage() {
  return <DealerPaymentsV4Preview />;
}
