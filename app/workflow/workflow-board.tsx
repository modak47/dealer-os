"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StockWorkflowRow, WorkflowStatus } from "@/lib/stock-workflow";

type Mode = "manager" | "workshop" | "valeting" | "photos";

const statuses: { key: WorkflowStatus; label: string }[] = [
  { key: "pending", label: "Waiting" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "completed", label: "Completed" },
];

function apiScope(mode: Mode) {
  if (mode === "workshop") return "department=Workshop+Preparation";
  if (mode === "valeting") return "group=valeting";
  if (mode === "photos") return "department=Photos";
  return "";
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function count(tasks: StockWorkflowRow[], status: WorkflowStatus) {
  return tasks.filter((task) => task.status === status).length;
}

export function WorkflowBoard({ initialTasks, mode, migrationReady, initialError = "" }: { initialTasks: StockWorkflowRow[]; mode: Mode; migrationReady: boolean; initialError?: string }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [busyBoard, setBusyBoard] = useState(false);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => tasks.filter((task) => {
    if (statusFilter !== "all" && task.status !== statusFilter) return false;
    if (!includeCompleted && task.status === "completed") return false;
    if (!query) return true;
    const haystack = `${task.department} ${task.status} ${task.notes || ""} ${task.bike?.make || ""} ${task.bike?.model || ""} ${task.bike?.variant || ""} ${task.bike?.registration || ""} ${task.bike?.year || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }), [tasks, statusFilter, includeCompleted, query]);

  async function reload() {
    setBusyBoard(true);
    setError("");
    const params = new URLSearchParams(apiScope(mode));
    params.set("includeCompleted", "true");
    const response = await fetch(`/api/workflow?${params.toString()}`);
    const body = await response.json();
    if (response.ok) setTasks(body.tasks || []);
    else setError(body.error || "Unable to reload workflow.");
    setBusyBoard(false);
  }

  async function act(task: StockWorkflowRow, action: "start" | "complete" | "block" | "reopen") {
    setBusyId(task.id);
    setError("");
    setMessage("");
    const response = await fetch(`/api/workflow/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, notes: task.notes }) });
    const body = await response.json();
    if (!response.ok) setError(body.error || "Unable to update task.");
    await reload();
    setBusyId("");
  }

  async function saveNotes(task: StockWorkflowRow, notes: string) {
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, notes } : item));
    setBusyId(task.id);
    const response = await fetch(`/api/workflow/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) });
    const body = await response.json();
    if (!response.ok) setError(body.error || "Unable to save notes.");
    setBusyId("");
  }

  async function backfill() {
    setBusyBoard(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "backfill" }) });
    const body = await response.json();
    if (response.ok) {
      setMessage(`Backfill complete. ${body.created || 0} workflow task${body.created === 1 ? "" : "s"} created.`);
      await reload();
    } else setError(body.error || "Unable to backfill workflow tasks.");
    setBusyBoard(false);
  }

  return <div className="workflow-board">
    {!migrationReady && <div className="crm-setup"><b>Workflow database setup required</b><span>Run 20260709000100_stock_preparation_workflow.sql in Supabase.</span></div>}
    {error && <p className="invoice-error">{error}</p>}
    {message && <p className="invoice-success">{message}</p>}
    <div className="workflow-kpis">
      <article><span>Waiting</span><strong>{count(tasks, "pending")}</strong></article>
      <article><span>In progress</span><strong>{count(tasks, "in_progress")}</strong></article>
      <article><span>Blocked</span><strong>{count(tasks, "blocked")}</strong></article>
      <article><span>Completed</span><strong>{count(tasks, "completed")}</strong></article>
    </div>
    <div className="workflow-filters">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search make, model, registration, notes..." />
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as WorkflowStatus | "all")}><option value="all">All statuses</option>{statuses.map((status) => <option value={status.key} key={status.key}>{status.label}</option>)}</select>
      <label><input type="checkbox" checked={includeCompleted} onChange={(event) => setIncludeCompleted(event.target.checked)} /> Show completed</label>
      <button onClick={() => void reload()} disabled={busyBoard}>{busyBoard ? "Refreshing..." : "Refresh"}</button>
      {mode === "manager" && <button onClick={() => void backfill()} disabled={busyBoard}>Backfill existing bikes</button>}
    </div>
    <div className="workflow-columns">
      {statuses.map((status) => {
        const columnTasks = filtered.filter((task) => task.status === status.key);
        return <section className={`workflow-column ${status.key}`} key={status.key}>
          <header><h2>{status.label}</h2><span>{columnTasks.length}</span></header>
          <div>{columnTasks.map((task) => <WorkflowCard task={task} busy={busyId === task.id} saveNotes={saveNotes} act={act} key={task.id} />)}{!columnTasks.length && <p className="workflow-empty">Nothing here.</p>}</div>
        </section>;
      })}
    </div>
  </div>;
}

function WorkflowCard({ task, busy, saveNotes, act }: { task: StockWorkflowRow; busy: boolean; saveNotes: (task: StockWorkflowRow, notes: string) => Promise<void>; act: (task: StockWorkflowRow, action: "start" | "complete" | "block" | "reopen") => Promise<void> }) {
  const bikeHref = task.bike ? `/admin/stock/${task.bike.id}` : "/admin/stock";
  return <article className="workflow-card">
    <Link href={bikeHref} className="workflow-bike">
      <img src={task.bike?.image || "/bike-placeholder.svg"} alt={task.bike ? `${task.bike.make} ${task.bike.model}` : "Stock motorcycle"} />
      <div><p>{task.department}</p><h3>{task.bike ? `${task.bike.make} ${task.bike.model}` : "Bike not found"}</h3>{task.bike?.variant && <span>{task.bike.variant}</span>}<small>{task.bike?.registration || "Registration pending"} · {task.bike?.year || "Year missing"} · {task.bike?.status || statusLabel(task.status)}</small></div>
    </Link>
    <div className="workflow-meta"><span>{statusLabel(task.status)}</span><small>Started {dateTime(task.started_at)}</small><small>Completed {dateTime(task.completed_at)}</small></div>
    <label className="workflow-notes"><span>Notes</span><textarea defaultValue={task.notes || ""} onBlur={(event) => void saveNotes(task, event.target.value)} placeholder="Add preparation notes..." /></label>
    <div className="workflow-actions">
      <button onClick={() => void act(task, "start")} disabled={busy || task.status === "in_progress" || task.status === "completed"}>Start</button>
      <button onClick={() => void act(task, "complete")} disabled={busy || task.status === "completed"}>Complete</button>
      <button onClick={() => void act(task, "block")} disabled={busy || task.status === "blocked" || task.status === "completed"}>Block</button>
      <button onClick={() => void act(task, "reopen")} disabled={busy || task.status === "pending"}>Reopen</button>
    </div>
  </article>;
}
