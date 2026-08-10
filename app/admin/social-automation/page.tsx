import { AdminPage } from "../dashboard/page";
import { getSocialAutomationData } from "@/lib/social-automation";
import { SocialAutomationClient } from "./social-automation-client";

export const dynamic = "force-dynamic";

export default async function SocialAutomationPage() {
  const data = await getSocialAutomationData();
  return <AdminPage title="Social Automation" sub="Plan and approve stock posts for Facebook, Instagram, Pinterest and Google Business.">
    {!data.migrationReady ? <div className="crm-setup"><b>Social automation is not ready yet</b><span>{data.error ?? "Run the social automation migration in Supabase to enable this module."}</span></div> : <SocialAutomationClient channels={data.channels} templates={data.templates} queue={data.queue} stock={data.eligibleStock} publishingOverview={data.publishingOverview} />}
  </AdminPage>;
}
