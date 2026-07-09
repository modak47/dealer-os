import { AdminPage } from "@/app/admin/dashboard/page";
import { AdminShell } from "@/app/admin/admin-shell";
import { getAdminIdentity } from "@/lib/admin-identity";
import { getStockWorkflowTasks } from "@/lib/stock-workflow";
import { WorkflowBoard } from "./workflow-board";

export const dynamic = "force-dynamic";

export default async function WorkflowPage() {
  const [identity, result] = await Promise.all([getAdminIdentity(), getStockWorkflowTasks({ includeCompleted: true })]);
  return <AdminShell identity={identity}>
    <AdminPage title="Preparation workflow" sub="Manager overview of workshop, valeting and photography tasks." hint="Every new stock bike gets these tasks automatically.">
      <WorkflowBoard mode="manager" initialTasks={result.tasks} migrationReady={result.migrationReady} initialError={result.error} />
    </AdminPage>
  </AdminShell>;
}
