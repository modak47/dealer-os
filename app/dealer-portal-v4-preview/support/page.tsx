import type { Metadata } from "next";
import { DealerSupportV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorGeeks Support V4 Preview",
  robots: { index: false, follow: false },
};

export default function DealerSupportV4PreviewPage() {
  return <DealerSupportV4Preview />;
}
