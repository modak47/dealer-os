import type { Metadata } from "next";
import { DealerLeadWorkspaceV4Live } from "../../v4-live-client";

export const metadata: Metadata = {
  title: "Dealer Lead Workspace",
  description: "Review and work a YesMoto dealer opportunity.",
};

export default async function DealerLeadWorkspacePage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  return <DealerLeadWorkspaceV4Live leadId={leadId} />;
}
