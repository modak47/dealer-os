import type { Metadata } from "next";
import { DealerLeadWorkspaceV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorLeads Lead Workspace V4 Preview",
  robots: { index: false, follow: false },
};

type LeadTab = "overview" | "vehicle-check" | "mot" | "location" | "customer";

export default async function DealerLeadWorkspaceV4PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; state?: string }> }) {
  const [routeParams, query] = await Promise.all([params, searchParams]);
  const tab = ["overview", "vehicle-check", "mot", "location", "customer"].includes(query.tab ?? "") ? query.tab as LeadTab : "overview";
  const state = query.state === "claimed" ? "claimed" : "available";
  return <DealerLeadWorkspaceV4Preview tab={tab} state={state} opportunityId={routeParams.id} />;
}
