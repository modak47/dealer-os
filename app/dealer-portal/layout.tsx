import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "MotorGeeks Dealer Portal",
    template: "%s",
  },
  robots: { index: false, follow: false },
};

export default function DealerPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
