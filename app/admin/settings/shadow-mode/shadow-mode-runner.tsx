"use client";

import { useState } from "react";

type Result = { marker: string; ready: boolean; steps: { name: string; ok: boolean; detail: string }[]; cleanup: string };
type PurgeResult = { deleted: { table: string; count: number }[]; total: number; warnings: string[] };
type ApiError = { error?: string; code?: string | null; details?: string | null; hint?: string | null; steps?: Result["steps"] };

export function ShadowModeRunner() {
  const [running, setRunning] = useState(false);
  const [purging, setPurging] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    setResult(null);
    const response = await fetch("/api/admin/shadow-mode/run-tests", { method: "POST" });
    const body = await response.json() as Result | ApiError;
    setRunning(false);
    if (!response.ok) {
      const problem = body as ApiError;
      setError([problem.error || "Controlled shadow-mode tests failed.", problem.code, problem.details, problem.hint].filter(Boolean).join(" "));
      if ("marker" in body) setResult(body as Result);
      return;
    }
    setResult(body as Result);
  }

  async function purge() {
    if (!confirm("Clear all records created by controlled Shadow Mode tests?")) return;
    setPurging(true);
    setError("");
    setPurgeResult(null);
    const response = await fetch("/api/admin/shadow-mode/purge-test-data", { method: "POST" });
    const body = await response.json() as PurgeResult | ApiError;
    setPurging(false);
    if (!response.ok) {
      setError((body as ApiError).error || "Unable to clear shadow-mode test data.");
      return;
    }
    setPurgeResult(body as PurgeResult);
  }

  return (
    <section className="stock-editor-panel">
      <header>
        <div>
          <h2>Controlled DMS Test Run</h2>
          <p>Creates marked internal test records using real stock, CRM, invoice, payment and ledger workflows.</p>
        </div>
        <div className="shadow-mode-actions">
          <button className="shadow-mode-clear" type="button" onClick={purge} disabled={purging || running}>
            {purging ? "Clearing..." : "Clear Test Data"}
          </button>
          <button className="admin-primary" type="button" onClick={run} disabled={running || purging}>
            {running ? "Running..." : "Run Controlled Tests"}
          </button>
        </div>
      </header>
      <div className="stock-form-grid">
        <div className="full crm-setup">
          <b>Safety rules</b>
          <span>Test stock is marked test, hidden from the public website, reserve disabled, and excluded from normal stock-ledger totals after the migration is applied.</span>
        </div>
        {error && <p className="full stock-save-message">{error}</p>}
        {purgeResult && (
          <div className="full crm-setup">
            <b>Shadow test data cleared</b>
            <span>{purgeResult.total} test records removed. Normal DMS pages also hide any remaining records marked as test.</span>
            {purgeResult.deleted.length > 0 && <span>{purgeResult.deleted.map(row => `${row.table}: ${row.count}`).join(" | ")}</span>}
            {purgeResult.warnings.length > 0 && <span>{purgeResult.warnings.join(" ")}</span>}
          </div>
        )}
        {result && (
          <div className="full">
            <h3>{result.ready ? "Ready evidence collected" : "Issues found"}</h3>
            <p>Marker: {result.marker}</p>
            <div className="vehicle-records">
              {result.steps.map((step) => (
                <article key={step.name}>
                  <b>{step.ok ? "OK" : "Needs review"} - {step.name}</b>
                  <span>{step.detail}</span>
                </article>
              ))}
            </div>
            <p>{result.cleanup}</p>
          </div>
        )}
      </div>
    </section>
  );
}
