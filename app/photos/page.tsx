import { AdminPage } from "@/app/admin/dashboard/page";
import { AdminShell } from "@/app/admin/admin-shell";
import { getAdminIdentity } from "@/lib/admin-identity";
import { getStockWorkflowTasks } from "@/lib/stock-workflow";
import { WorkflowBoard } from "@/app/workflow/workflow-board";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const [identity, result] = await Promise.all([getAdminIdentity(), getStockWorkflowTasks({ departments: ["Photos"], includeCompleted: true })]);
  return <AdminShell identity={identity}>
    <AdminPage title="Photos" sub="Bikes waiting for advert photography, image review and publication readiness." hint="Department view: Photos">
      <WorkflowBoard mode="photos" initialTasks={result.tasks} migrationReady={result.migrationReady} initialError={result.error} />
    </AdminPage>
  </AdminShell>;
}
