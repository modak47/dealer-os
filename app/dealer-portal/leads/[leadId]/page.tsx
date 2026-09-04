import type { Metadata } from "next";
import { LeadWorkspaceClient } from "../../portal-client";

export const metadata: Metadata = {
  title: "Dealer Lead Workspace",
  description: "Review and work a YesMoto dealer opportunity.",
};

export default async function DealerLeadWorkspacePage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  return <LeadWorkspaceClient leadId={leadId} />;
}
