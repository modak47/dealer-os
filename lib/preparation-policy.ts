export type PreparationView = "active" | "history" | "unlinked";

export function inactivePreparationReason(bike: { status?: string | null; is_test_record?: boolean } | null) {
  if (!bike) return "The linked stock record no longer exists. This task is kept for reference.";
  if (bike.is_test_record) return "Test or voided stock record.";
  const status = bike.status?.trim().toLowerCase().replace(/[_-]+/g, " ") || "";
  if (["sold", "sale completed", "completed", "delivered", "collected", "archived", "cancelled", "canceled", "purchase cancelled", "purchase canceled", "deleted"].includes(status)) {
    return `Stock status: ${bike.status}. Preparation is read-only.`;
  }
  if (status === "purchase pending") return "Awaiting arrival. Preparation starts when the bike is received.";
  return null;
}

export function preparationView(task: { status: string; bike: { status?: string | null; is_test_record?: boolean } | null }): PreparationView {
  if (!task.bike) return "unlinked";
  return inactivePreparationReason(task.bike) || task.status === "completed" ? "history" : "active";
}
