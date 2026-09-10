import type { Metadata } from "next";
import { DealerMarketplaceWorkspaceV4Live } from "../../v4-live-client";

export const metadata: Metadata = {
  title: "MotorGeeks Offer Lead Workspace",
  robots: { index: false, follow: false },
};

export default async function DealerOfferLeadWorkspacePage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  return <DealerMarketplaceWorkspaceV4Live leadId={leadId} />;
}
