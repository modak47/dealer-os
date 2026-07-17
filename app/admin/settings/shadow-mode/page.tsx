import Link from "next/link";
import { AdminPage } from "../../dashboard/page";
import { ShadowModeRunner } from "./shadow-mode-runner";

export const dynamic = "force-dynamic";

export default function ShadowModePage() {
  return (
    <AdminPage
      title="Controlled Shadow Mode"
      sub="Run marked internal DMS tests before asking staff to shadow Dealer5."
      actions={<Link className="admin-primary" href="/admin/settings/dealer5-shadow">Dealer5 Health</Link>}
    >
      <ShadowModeRunner />
    </AdminPage>
  );
}
