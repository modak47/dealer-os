import type { Metadata } from "next";
import { DealerLoginV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorGeeks Dealer Login V4 Preview",
  robots: { index: false, follow: false },
};

export default function DealerLoginV4PreviewPage() {
  return <DealerLoginV4Preview />;
}
