"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import type { StockWorkflowRow, WorkflowStatus } from "@/lib/stock-workflow";
import { inactivePreparationReason, preparationView, type PreparationView } from "@/lib/preparation-policy";
import styles from "./workflow.module.css";

type Mode = "manager" | "workshop" | "valeting" | "photos";
type Action = "start" | "complete" | "block" | "reopen";
const statuses: { key: WorkflowStatus; label: string }[] = [
  { key: "pending", label: "Waiting" }, { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" }, { key: "completed", label: "Completed" },
];
const views: { key: PreparationView; label: string }[] = [
  { key: "active", label: "Active preparation" }, { key: "history", label: "History" }, { key: "unlinked", label: "Unlinked tasks" },
];
function apiScope(mode: Mode) {
  if (mode === "workshop") return "department=Workshop+Preparation";
  if (mode === "valeting") return "group=valeting";
  if (mode === "photos") return "department=Photos";
  return "";
}
function statusLabel(value: string) { return statuses.find(status => status.key === value)?.label || value; }
function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";
}
async function readResponse(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Unable to save preparation. Please try again.");
  if (!body || body.error) throw new Error(body?.error || "Unable to load preparation. Please try again.");
  return body;
}

export function WorkflowBoard({ initialTasks, mode, migrationReady, initialError = "" }: { initialTasks: StockWorkflowRow[]; mode: Mode; migrationReady: boolean; initialError?: string }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState<PreparationView>("active");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [busyBoard, setBusyBoard] = useState(false);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [limit, setLimit] = useState(6);
  const scoped = useMemo(() => tasks.filter(task => preparationView(task) === view), [tasks, view]);
  const filtered = useMemo(() => scoped.filter(task => {
    if (statusFilter !== "all" && task.status !== statusFilter) return false;
    const haystack = `${task.stock_bike_id} ${task.department} ${task.status} ${task.notes || ""} ${task.bike?.make || ""} ${task.bike?.model || ""} ${task.bike?.variant || ""} ${task.bike?.registration || ""} ${task.bike?.stockNumber || ""} ${task.bike?.year || ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [scoped, statusFilter, query]);

  async function reload() {
    const params = new URLSearchParams(apiScope(mode));
    params.set("view", "all"); params.set("includeCompleted", "true");
    const body = await readResponse(await fetch(`/api/workflow?${params}`));
    if (!Array.isArray(body.tasks)) throw new Error("Preparation returned an invalid response. Try refreshing.");
    setTasks(body.tasks);
  }
  async function refresh() {
    setBusyBoard(true); setError(""); setMessage("");
    try { await reload(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to refresh preparation."); }
    finally { setBusyBoard(false); }
  }
  async function save(task: StockWorkflowRow, notes: string, action?: Action) {
    setBusyId(task.id); setError(""); setMessage("");
    try {
      if (action === "block" && !notes.trim()) throw new Error("Add a note explaining why this task is blocked.");
      const body = await readResponse(await fetch(`/api/workflow/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(action ? { action } : {}), notes, updated_at: task.updated_at }),
      }));
      setTasks(current => current.map(item => item.id === task.id ? { ...item, ...body.task } : item));
      setMessage(action === "complete" ? "Task completed and moved to History." : action === "reopen" ? "Task reopened in active preparation." : "Preparation saved.");
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save preparation."); return false; }
    finally { setBusyId(""); }
  }
  async function backfill() {
    setBusyBoard(true); setError(""); setMessage("");
    try {
      const body = await readResponse(await fetch("/api/workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "backfill" }) }));
      await reload(); setMessage(`${body.created || 0} missing task${body.created === 1 ? "" : "s"} added for active stock. Existing progress was kept.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to add missing tasks."); }
    finally { setBusyBoard(false); }
  }
  async function uploaded() {
    await reload(); setMessage("PDI uploaded. Workshop preparation is complete.");
  }
  const columns = statuses.filter(status => (view !== "active" || status.key !== "completed") && (statusFilter === "all" || statusFilter === status.key)
    && (view === "active" || filtered.some(task => task.status === status.key)));
  return <div className={`workflow-board ${styles.board}`} aria-busy={busyBoard}>
    {!migrationReady && <div className="crm-setup"><b>Workflow database setup required</b><span>Contact your system administrator to finish preparation setup.</span></div>}
    {error && <p className="invoice-error" role="alert">{error}</p>}
    {message && <p className="invoice-success" role="status">{message}</p>}
    <nav className={styles.views} aria-label="Preparation views">
      {views.map(item => <button key={item.key} type="button" aria-pressed={view === item.key} onClick={() => { setView(item.key); setStatusFilter("all"); setLimit(6); }}>
        {item.label} <span>{tasks.filter(task => preparationView(task) === item.key).length}</span>
      </button>)}
    </nav>
    <p className={styles.explanation}>{view === "active" ? "Unfinished work for bikes currently in stock. Completed tasks and sold bikes move to History automatically." : view === "history" ? "Completed tasks and retired stock. You can reopen completed work while its bike is still in active stock." : "These tasks refer to stock records that no longer exist. They cannot be edited or mistaken for current bikes."}</p>
    <div className="workflow-kpis">
      {statuses.map(status => <article key={status.key}><span>{status.label}</span><strong>{scoped.filter(task => task.status === status.key).length}</strong></article>)}
    </div>
    <div className="workflow-filters">
      <input aria-label="Search preparation" value={query} onChange={event => { setQuery(event.target.value); setLimit(6); }} placeholder="Search bike, registration, stock ID or notes…" />
      <select aria-label="Task status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value as WorkflowStatus | "all"); setLimit(6); }}><option value="all">All statuses</option>{statuses.filter(status => view !== "active" || status.key !== "completed").map(status => <option value={status.key} key={status.key}>{status.label}</option>)}</select>
      <button type="button" onClick={() => void refresh()} disabled={busyBoard || Boolean(busyId)}>Refresh</button>
      {mode === "manager" && <button type="button" onClick={() => void backfill()} disabled={busyBoard || Boolean(busyId) || !migrationReady}>Add missing preparation tasks</button>}
    </div>
    <p className={styles.summary}>{filtered.length} task{filtered.length === 1 ? "" : "s"} · {new Set(filtered.map(task => task.stock_bike_id)).size} {view === "unlinked" ? "missing stock links" : "bikes"}</p>
    {!columns.length && <p className="workflow-empty">No tasks in this view{query.trim() ? " match your search" : ""}.</p>}
    <div className={`workflow-columns ${styles.columns}`}>
      {columns.map(status => {
        const columnTasks = filtered.filter(task => task.status === status.key);
        return <section className={`workflow-column ${status.key}`} key={status.key} aria-label={`${status.label} tasks`}>
          <header><h2>{status.label}</h2><span>{columnTasks.length}</span></header>
          <div tabIndex={0} role="region" aria-label={`${status.label} task list`}>{columnTasks.slice(0, limit).map(task => <WorkflowCard task={task} busy={busyBoard || Boolean(busyId)} save={save} uploaded={uploaded} key={`${task.id}:${task.updated_at}`} />)}
            {!columnTasks.length && <p className="workflow-empty">No {status.label.toLowerCase()} tasks{query.trim() ? " match your search" : " in this view"}.</p>}
            {columnTasks.length > limit && <button className={styles.more} type="button" onClick={() => setLimit(current => current + 6)}>Show more {status.label.toLowerCase()} tasks ({columnTasks.length - limit} remaining)</button>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}

function WorkflowCard({ task, busy, save, uploaded }: { task: StockWorkflowRow; busy: boolean; save: (task: StockWorkflowRow, notes: string, action?: Action) => Promise<boolean>; uploaded: () => Promise<void> }) {
  const [notes, setNotes] = useState(task.notes || "");
  const [pdiFile, setPdiFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const readonly = inactivePreparationReason(task.bike);
  async function uploadPdi() {
    if (!task.bike || !pdiFile) return;
    setUploading(true); setUploadError("");
    try {
      const form = new FormData();
      form.set("stock_bike_id", task.bike.id); form.set("attachment_type", "PDI Form");
      form.set("workflow_task_id", task.id); form.set("notes", "Uploaded from workshop workflow"); form.set("file", pdiFile);
      await readResponse(await fetch("/api/stock-attachments", { method: "POST", body: form }));
      setPdiFile(null); await uploaded();
    } catch (err) { setUploadError(err instanceof Error ? err.message : "Unable to upload PDI. Task has not been marked complete."); }
    finally { setUploading(false); }
  }
  const disabled = busy || uploading || Boolean(readonly);
  const identity = <><Image unoptimized width={64} height={58} src={imageFailed ? "/bike-placeholder.svg" : task.bike?.image || "/bike-placeholder.svg"} onError={() => setImageFailed(true)} alt={task.bike ? `${task.bike.make} ${task.bike.model}` : "Unlinked stock task"} /><div><p>{task.department}</p><h3>{task.bike ? `${task.bike.make} ${task.bike.model}` : `Unlinked stock #${task.stock_bike_id}`}</h3>{task.bike?.variant && <span>{task.bike.variant}</span>}<small>{task.bike ? `${task.bike.registration || "VRM missing"} · Stock #${task.bike.stockNumber || task.stock_bike_id} · ${task.bike.status}` : "No linked bike or VRM available"}</small></div></>;
  return <article className="workflow-card" aria-label={`${task.department} · ${task.bike?.registration || `stock ${task.stock_bike_id}`}`}>
    {task.bike ? <Link href={`/admin/stock/${task.bike.id}`} className="workflow-bike">{identity}</Link> : <div className="workflow-bike">{identity}</div>}
    {readonly && <p className={styles.readonly}>{readonly}</p>}
    {task.bike && !task.bike.registration && <Link href={`/admin/stock/${task.bike.id}`}>Add missing registration to stock record</Link>}
    <div className="workflow-meta"><span>{statusLabel(task.status)}</span><small>Started {dateTime(task.started_at)}</small><small>Completed {dateTime(task.completed_at)}</small></div>
    {readonly ? <div className="workflow-notes"><span>Notes</span><p>{task.notes || "No notes recorded."}</p></div> : <label className="workflow-notes"><span>Notes</span><textarea value={notes} onChange={event => setNotes(event.target.value)} disabled={disabled} placeholder="Preparation notes or reason for blocking…" /></label>}
    {!readonly && <button className={styles.save} type="button" onClick={() => void save(task, notes)} disabled={disabled || notes === (task.notes || "")}>Save notes</button>}
    {!readonly && task.department === "Workshop Preparation" && task.bike && task.status !== "completed" && <div className="workflow-pdi-upload"><Link href={`/admin/stock/${task.bike.id}/pdi`}>Open digital PDI</Link><label><span>Upload completed PDI</span><input type="file" accept="application/pdf,image/*" disabled={disabled} onChange={event => setPdiFile(event.target.files?.[0] || null)} /></label><button type="button" onClick={() => void uploadPdi()} disabled={!pdiFile || disabled}>{uploading ? "Uploading…" : "Upload PDI"}</button>{uploadError && <p role="alert">{uploadError}</p>}</div>}
    {!readonly && <div className="workflow-actions">
      <button type="button" onClick={() => void save(task, notes, "start")} disabled={disabled || task.status === "in_progress" || task.status === "completed"}>Start</button>
      <button type="button" onClick={() => void save(task, notes, "complete")} disabled={disabled || task.status === "completed"}>Complete</button>
      <button type="button" onClick={() => void save(task, notes, "block")} disabled={disabled || task.status === "blocked" || task.status === "completed"}>Block</button>
      <button type="button" onClick={() => void save(task, notes, "reopen")} disabled={disabled || task.status === "pending"}>Reopen</button>
    </div>}
  </article>;
}
