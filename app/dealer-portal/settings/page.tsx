import type { Metadata } from "next";
import { DealerPortalV4Live } from "../v4-live-client";

export const metadata: Metadata = {
  title: "Dealer Account Settings",
  robots: { index: false, follow: false },
};

export default function DealerSettingsPage() {
  return <DealerPortalV4Live section="settings" />;
}
