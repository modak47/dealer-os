import { AdminPage } from "@/app/admin/dashboard/page";
import { AdminShell } from "@/app/admin/admin-shell";
import { getAdminIdentity } from "@/lib/admin-identity";
import { getStockWorkflowTasks } from "@/lib/stock-workflow";
import { WorkflowBoard } from "@/app/workflow/workflow-board";

export const dynamic = "force-dynamic";

export default async function ValetingPage() {
  const [identity, result] = await Promise.all([getAdminIdentity(), getStockWorkflowTasks({ departments: ["Wash / Initial Valet", "Final Valet"], includeCompleted: true })]);
  return <AdminShell identity={identity}>
    <AdminPage title="Valeting" sub="Initial wash, preparation cleaning and final handover valet workflow." hint="Department view: Wash / Initial Valet and Final Valet">
      <WorkflowBoard mode="valeting" initialTasks={result.tasks} migrationReady={result.migrationReady} initialError={result.error} />
    </AdminPage>
  </AdminShell>;
}
