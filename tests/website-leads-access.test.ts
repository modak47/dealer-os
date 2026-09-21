import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { isInternalStaffMembership } from "../lib/auth/staff-policy";

test("Website Leads requires an active internal staff membership", () => {
  for (const member of [null, { role: "dealer_admin", active: true }, { role: "dealer_user", active: true }, { role: "team_member", active: false }, { active: true }]) assert.equal(isInternalStaffMembership(member), false);
  assert.equal(isInternalStaffMembership({ role: "team_member", active: true }), true);
  for (const role of ["admin", "future_role", "", "TEAM_MEMBER"]) assert.equal(isInternalStaffMembership({ role, active: true }), false);
});
test("every Website Leads read and staff mutation is guarded before data access", () => {
  for (const file of readdirSync("app/api/website-leads", { recursive: true }).map(String).filter(f => f.endsWith("route.ts"))) {
    const source = readFileSync(`app/api/website-leads/${file}`, "utf8");
    for (const match of source.matchAll(/export async function (GET|PATCH|POST)[^\n]+\{\n([^\n]+)/g)) {
      if (file === "route.ts" && match[1] === "POST") { assert.match(source, /providedSecret !== expectedSecret/); continue; }
      assert.match(match[2], /requireWebsiteLeadStaff/, file);
    }
  }
  assert.match(readFileSync("app/website-leads/layout.tsx", "utf8"), /requireWebsiteLeadStaff\(true\)/);
});
