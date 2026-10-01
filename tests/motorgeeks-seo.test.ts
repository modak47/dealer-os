import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = "apps/motorleads/app";
const read = (path: string) => readFileSync(path, "utf8");

test("MotorGeeks sitemap contains public guides and excludes private routes", () => {
  const sitemap = read(`${app}/sitemap.ts`);
  for (const path of ["/sell-my-motorbike", "/motorbike-valuation", "/how-to-sell-a-motorbike", "/valuation"]) assert.match(sitemap, new RegExp(path));
  assert.doesNotMatch(sitemap, /"\/seller/);
  assert.doesNotMatch(sitemap, /"\/api/);
});

test("private seller routes remain noindex with self-referencing canonicals", () => {
  for (const [file, path] of [["seller/page.tsx", "/seller"], ["seller/recover/page.tsx", "/seller/recover"], ["seller/verify/page.tsx", "/seller/verify"], ["seller/invalid/page.tsx", "/seller/invalid"]]) {
    const source = read(`${app}/${file}`);
    assert.match(source, /index:\s*false/);
    assert.match(source, new RegExp(path.replaceAll("/", "\\/")));
  }
});

test("seller verification keeps the secure POST same-origin and separates recovery", () => {
  const verify = read(`${app}/seller/verify/page.tsx`);
  assert.match(verify, /referrer:\s*'same-origin'/);
  assert.doesNotMatch(verify, /referrer:\s*'no-referrer'/);
  assert.match(verify, /mg-seller-access-actions/);
  assert.match(verify, /action="\/api\/seller\/access" method="post"/);
  assert.match(verify, /href="\/seller\/recover"/);
});

test("homepage publishes truthful organization and website structured data", () => {
  const homepage = read(`${app}/page.tsx`);
  assert.match(homepage, /"@type": "Organization"/);
  assert.match(homepage, /"@type": "WebSite"/);
  assert.doesNotMatch(homepage, /AggregateRating|Review|sameAs/);
});

test("seller guides use unique intent-led metadata and breadcrumb markup", () => {
  const titles = new Set<string>();
  for (const route of ["sell-my-motorbike", "motorbike-valuation", "how-to-sell-a-motorbike"]) {
    const source = read(`${app}/${route}/page.tsx`);
    const title = source.match(/pageMetadata\(\s*"([^"]+)"/)?.[1];
    assert.ok(title);
    assert.ok(!titles.has(title));
    titles.add(title);
    assert.match(source, /<Breadcrumbs/);
    assert.match(source, /href="\/valuation"/);
  }
});

test("FAQ copy reflects the product without ineligible FAQ rich-result markup", () => {
  const sections = read(`${app}/components/sections.tsx`);
  for (const question of ["How does MotorGeeks work?", "How is my motorbike valued?", "Does MotorGeeks buy the motorcycle?"]) assert.match(sections, new RegExp(question.replace("?", "\\?")));
  assert.doesNotMatch(read(`${app}/faq/page.tsx`), /FAQPage|application\/ld\+json/);
});

test("www host is permanently redirected to the non-www canonical host", () => {
  const config = read("apps/motorleads/next.config.ts");
  assert.match(config, /www\.motorgeeks\.co\.uk/);
  assert.match(config, /https:\/\/motorgeeks\.co\.uk\/\:path\*/);
  assert.match(config, /permanent:\s*true/);
});
