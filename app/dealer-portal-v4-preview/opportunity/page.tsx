import type { Metadata } from "next";
import { DealerLeadWorkspaceV4Preview } from "@/app/dealer-v4-preview/components";

export const metadata: Metadata = {
  title: "MotorGeeks Lead Workspace V4 Preview",
  robots: { index: false, follow: false },
};

type LeadTab = "overview" | "vehicle-check" | "mot" | "location" | "customer";

export default async function DealerLeadWorkspaceV4PreviewPage({ searchParams }: { searchParams: Promise<{ tab?: string; state?: string }> }) {
  const params = await searchParams;
  const tab = ["overview", "vehicle-check", "mot", "location", "customer"].includes(params.tab ?? "") ? params.tab as LeadTab : "overview";
  const state = params.state === "claimed" ? "claimed" : "available";
  return <DealerLeadWorkspaceV4Preview tab={tab} state={state} />;
}
