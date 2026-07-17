"use client";

import { useState } from "react";

type Result = { marker: string; ready: boolean; steps: { name: string; ok: boolean; detail: string }[]; cleanup: string };

export function ShadowModeRunner() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    setResult(null);
    const response = await fetch("/api/admin/shadow-mode/run-tests", { method: "POST" });
    const body = await response.json();
    setRunning(false);
    if (!response.ok) {
      setError(body.error || "Controlled shadow-mode tests failed.");
      if (body.steps) setResult(body);
      return;
    }
    setResult(body);
  }

  return (
    <section className="stock-editor-panel">
      <header>
        <div>
          <h2>Controlled DMS Test Run</h2>
          <p>Creates marked internal test records using real stock, CRM, invoice, payment and ledger workflows.</p>
        </div>
        <button className="admin-primary" type="button" onClick={run} disabled={running}>
          {running ? "Running..." : "Run Controlled Tests"}
        </button>
      </header>
      <div className="stock-form-grid">
        <div className="full crm-setup">
          <b>Safety rules</b>
          <span>Test stock is marked test, hidden from the public website, reserve disabled, and excluded from normal stock-ledger totals after the migration is applied.</span>
        </div>
        {error && <p className="full stock-save-message">{error}</p>}
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
