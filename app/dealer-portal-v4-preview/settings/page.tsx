import type { Metadata } from "next";
import { DealerSettingsV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorLeads Account Settings V4 Preview",
  robots: { index: false, follow: false },
};

export default function DealerSettingsV4PreviewPage() {
  return <DealerSettingsV4Preview />;
}
