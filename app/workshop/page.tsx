import { AdminPage } from "@/app/admin/dashboard/page";
import { AdminShell } from "@/app/admin/admin-shell";
import { getAdminIdentity } from "@/lib/admin-identity";
import { getStockWorkflowTasks } from "@/lib/stock-workflow";
import { WorkflowBoard } from "@/app/workflow/workflow-board";

export const dynamic = "force-dynamic";

export default async function WorkshopPage() {
  const [identity, result] = await Promise.all([getAdminIdentity(), getStockWorkflowTasks({ departments: ["Workshop Preparation"], includeCompleted: true })]);
  return <AdminShell identity={identity}>
    <AdminPage title="Workshop preparation" sub="Bikes waiting for mechanical preparation, checks, repairs and workshop notes." hint="Department view: Workshop Preparation">
      <WorkflowBoard mode="workshop" initialTasks={result.tasks} migrationReady={result.migrationReady} initialError={result.error} />
    </AdminPage>
  </AdminShell>;
}
