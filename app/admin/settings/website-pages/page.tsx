import { AdminPage } from "../../dashboard/page";
import { listWebsitePages } from "@/lib/website-pages";
import { WebsitePagesEditor } from "./website-pages-editor";

export const dynamic = "force-dynamic";

export default async function WebsitePagesSettings() {
  const result = await listWebsitePages();
  return <AdminPage title="Website SEO & pages" sub="Edit public page SEO, social previews and create simple customer-facing pages.">
    {!result.migrationReady && <div className="crm-setup"><b>Website pages migration required</b><span>Run migration 20260721000100_website_pages_seo.sql in Supabase before saving website page settings.</span></div>}
    <WebsitePagesEditor initialPages={result.pages} migrationReady={result.migrationReady} />
  </AdminPage>;
}
