import type { Metadata } from "next";
import { DealerPurchasedV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorGeeks Purchased V4 Preview",
  robots: { index: false, follow: false },
};

export default function DealerPurchasedV4PreviewPage() {
  return <DealerPurchasedV4Preview />;
}
