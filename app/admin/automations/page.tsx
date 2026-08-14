import { AdminPage } from "../dashboard/page";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type AutomationJob = {
  job_name: string;
  last_started: string | null;
  last_finished: string | null;
  status: "unknown" | "running" | "success" | "failed";
  duration_ms: number | null;
  last_error: string | null;
  updated_at: string;
};

const labels: Record<string, string> = {
  autotrader_recent_scraper: "AutoTrader Recent Scraper",
  autotrader_scraper_1: "AutoTrader Scraper 1",
  autotrader_scraper_2: "AutoTrader Scraper 2",
  autotrader_scraper_3: "AutoTrader Scraper 3",
  autotrader_scraper_4: "AutoTrader Scraper 4",
  autotrader_scraper_5: "AutoTrader Scraper 5",
  opportunity_scanner: "Opportunity Scanner",
  dealer5_sync: "Dealer5 Sync",
};

const legacyJobNames = new Set(["scrapers", "recent_scraper", "retail_scanner"]);

export default async function AutomationsPage() {
  const { data, error } = await getSupabaseAdmin()
    .from("automation_jobs")
    .select("*")
    .order("job_name", { ascending: true });

  const jobs = ((data ?? []) as AutomationJob[]).filter((job) => !legacyJobNames.has(job.job_name));

  return (
    <AdminPage
      title="Automation Health"
      sub="Operational status for scheduled jobs and Raspberry Pi workers."
      hint={error ? "Run the automation_jobs migration in Supabase to enable this dashboard." : undefined}
    >
      {error ? (
        <div className="crm-setup">
          <b>Automation status is not ready</b>
          <span>{error.message}</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Last Started</th>
                <th>Last Finished</th>
                <th>Duration</th>
                <th>Last Error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.job_name}>
                  <td>{labels[job.job_name] ?? job.job_name}</td>
                  <td>{statusText(job.status)}</td>
                  <td>{formatDate(job.last_started)}</td>
                  <td>{formatDate(job.last_finished)}</td>
                  <td>{formatDuration(job.duration_ms)}</td>
                  <td>{job.last_error || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB") : "-";
}

function formatDuration(value: number | null) {
  return typeof value === "number" ? `${Math.round(value / 1000)}s` : "-";
}

function statusText(value: AutomationJob["status"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
