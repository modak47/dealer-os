import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import type { StockWorkflowRow } from "../../lib/stock-workflow";
const sizes = [[1440,900],[1280,800],[768,1024],[390,844]];
const routes = [["/workflow","Preparation workflow"],["/workshop","Workshop preparation"],["/valeting","Valeting"],["/photos","Photos"]];
const directory = "design-references/current/preparation";
function fixture(): StockWorkflowRow[] {
  const departments = ["Workshop Preparation","Wash / Initial Valet","Final Valet","Photos"] as const;
  return departments.flatMap((department, i) => [
    { id: `open-${i}`, stock_bike_id: "qa-101", department, status: "pending" as const, bike: { id: "qa-101", make: "Triumph", model: "Speed Twin 1200 with a longer model description", variant: "Roadster / Retro", registration: "FG69OKR", year: 2020, status: "In Stock", image: "/bike-placeholder.svg" } },
    { id: `done-${i}`, stock_bike_id: "qa-102", department, status: "completed" as const, bike: { id: "qa-102", make: "Honda", model: "CB500F", variant: "", registration: "DONE123", year: 2021, status: "In Stock", image: "/bike-placeholder.svg" } },
    { id: `sold-${i}`, stock_bike_id: "qa-103", department, status: "pending" as const, bike: { id: "qa-103", make: "Yamaha", model: "MT-07", variant: "", registration: "SOLD123", year: 2020, status: "Sale Completed", image: "/bike-placeholder.svg" } },
    { id: `orphan-${i}`, stock_bike_id: "qa-999", department, status: "blocked" as const, bike: null },
    { id: `novrm-${i}`, stock_bike_id: "qa-104", department, status: "in_progress" as const, bike: { id: "qa-104", make: "BMW", model: "R 1250 GS", variant: "", registration: "", year: 2022, status: "Reserved", image: "/bike-placeholder.svg" } },
  ]).map(row => ({ ...row, assigned_to: null, notes: "", started_at: null, completed_at: null, completed_by: null, created_at: "2026-11-14T10:00:00Z", updated_at: "2026-11-14T10:00:00Z" }));
}
async function prepare(page: Page, path: string) {
  let rows = fixture(); let failRefresh = false; let failSave = false; let uploadFail = true;
  const actions: Record<string,unknown>[] = [];
  const scope = () => rows.filter(row => path === "/workshop" ? row.department === "Workshop Preparation" : path === "/valeting" ? row.department.includes("Valet") : path === "/photos" ? row.department === "Photos" : true);
  await page.route("**/api/workflow?*", route => failRefresh ? route.abort("failed") : route.fulfill({ json: { tasks: scope(), migrationReady: true } }));
  await page.route("**/api/workflow", route => route.fulfill({ json: { created: 0 } }));
  await page.route("**/api/workflow/*", route => {
    const body = route.request().postDataJSON(); actions.push(body);
    if (failSave) return route.fulfill({ status: 409, json: { error: "This task changed. Refresh before saving." } });
    const id = route.request().url().split("/").pop();
    rows = rows.map(row => row.id === id ? { ...row, notes: body.notes, status: body.action === "complete" ? "completed" : body.action === "start" ? "in_progress" : body.action === "block" ? "blocked" : body.action === "reopen" ? "pending" : row.status, updated_at: "2026-11-14T10:01:00Z" } : row);
    return route.fulfill({ json: { task: rows.find(row => row.id === id) } });
  });
  await page.route("**/api/stock-attachments", route => {
    if (uploadFail) return route.fulfill({ status: 500, json: { error: "Upload failed. Task remains open." } });
    rows = rows.map(row => row.id === "open-0" ? { ...row, status: "completed" } : row);
    return route.fulfill({ status: 201, json: { attachment: { id: "qa-upload" } } });
  });
  await page.goto(path); await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".workflow-card").first()).toContainText("Triumph");
  await page.addStyleTag({ content: "nextjs-portal { display:none }" });
  return { actions, failRefresh: () => { failRefresh = true; }, failSave: () => { failSave = true; }, uploadWorks: () => { uploadFail = false; } };
}
async function check(page: Page, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
}
async function axe(page: Page) {
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: (scope: string, options: unknown) => Promise<{ violations: { id: string; impact: string }[] }> } }).axe.run("main", { runOnly: { type: "tag", values: ["wcag2a","wcag2aa"] } })).violations.filter(v => ["serious","critical"].includes(v.impact)));
  expect(violations).toEqual([]);
}
for (const [width,height] of sizes) {
  for (const [path,title] of routes) {
    test(`${path} active, history and unlinked at ${width} @visual`, async ({ page }) => {
      test.setTimeout(90_000); mkdirSync(directory, { recursive: true }); await page.setViewportSize({ width,height });
      const errors: string[] = [], failed: string[] = [];
      page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") failed.push(request.url()); });
      await prepare(page,path); await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.locator(".workflow-card")).not.toContainText(["SOLD123"]);
      await expect(page.getByText("VRM missing", { exact: false }).first()).toBeVisible();
      await check(page,`${path.slice(1)}-active-${width}`); await axe(page);
      await page.getByRole("button", { name: /^History/ }).click();
      const sold = page.locator(".workflow-card").filter({ hasText: "SOLD123" }).first();
      await expect(sold).toContainText("read-only"); await expect(sold.getByRole("button")).toHaveCount(0);
      await check(page,`${path.slice(1)}-history-${width}`);
      await page.getByRole("button", { name: /^Unlinked tasks/ }).click();
      await expect(page.locator(".workflow-card").first()).toContainText("Unlinked stock #qa-999");
      await expect(page.locator(".workflow-card a")).toHaveCount(0); await expect(page.locator(".workflow-card button")).toHaveCount(0);
      await check(page,`${path.slice(1)}-unlinked-${width}`); await axe(page);
      expect(errors).toEqual([]); expect(failed).toEqual([]);
    });
  }
}
for (const [width,height] of [sizes[0],sizes[3]]) {
  test(`preparation actions, notes, upload and failure recovery at ${width} @visual`, async ({ page }) => {
    await page.setViewportSize({width,height}); const state = await prepare(page,"/workshop");
    let card = page.locator(".workflow-card").filter({ hasText: "FG69OKR" });
    await card.getByRole("button",{name:"Block",exact:true}).click(); await expect(page.locator(".workflow-board").getByRole("alert")).toContainText("Add a note"); expect(state.actions).toHaveLength(0);
    await card.getByLabel("Notes",{exact:true}).fill("Waiting for brake parts"); await card.getByRole("button",{name:"Save notes",exact:true}).click(); await expect(page.locator(".workflow-board").getByRole("status")).toContainText("saved");
    await card.getByRole("button",{name:"Block",exact:true}).click(); await expect(card.locator(".workflow-meta")).toContainText("Blocked");
    await card.getByRole("button",{name:"Start",exact:true}).click(); await expect(card.locator(".workflow-meta")).toContainText("In progress");
    await card.getByRole("button",{name:"Complete",exact:true}).click(); await expect(page.locator(".workflow-board").getByRole("status")).toContainText("moved to History"); await expect(page.locator(".workflow-card").filter({hasText:"FG69OKR"})).toHaveCount(0);
    await page.getByRole("button",{name:/^History/}).click(); card = page.locator(".workflow-card").filter({hasText:"FG69OKR"}); await card.getByRole("button",{name:"Reopen",exact:true}).click();
    await page.getByRole("button",{name:/^Active preparation/}).click(); card = page.locator(".workflow-card").filter({hasText:"FG69OKR"});
    await card.getByLabel("Upload completed PDI").setInputFiles({name:"pdi.pdf",mimeType:"application/pdf",buffer:Buffer.from("synthetic PDI")}); await card.getByRole("button",{name:"Upload PDI",exact:true}).click();
    await expect(card.getByRole("alert")).toContainText("remains open"); await expect(card.locator(".workflow-meta")).toContainText("Waiting");
    state.uploadWorks(); await card.getByRole("button",{name:"Upload PDI",exact:true}).click(); await expect(page.locator(".workflow-board").getByRole("status")).toContainText("Workshop preparation is complete");
    await expect(page.locator(".workflow-card").filter({hasText:"FG69OKR"})).toHaveCount(0);
    state.failSave(); const remaining=page.locator(".workflow-card").first(); await remaining.getByRole("button",{name:"Complete",exact:true}).click(); await expect(page.locator(".workflow-board").getByRole("alert")).toContainText("Refresh before saving");
    state.failRefresh(); await page.getByRole("button",{name:"Refresh",exact:true}).click(); await expect(page.locator(".workflow-board").getByRole("alert")).toBeVisible(); await expect(page.getByRole("button",{name:"Refresh",exact:true})).toBeEnabled();
    await check(page,`actions-error-${width}`);
  });
}
