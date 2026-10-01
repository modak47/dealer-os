import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  bmwGuide,
  harleyGuide,
  hondaGuide,
  kawasakiGuide,
  ktmGuide,
  piaggioGuide,
  royalEnfieldGuide,
  suzukiGuide,
  triumphGuide,
  yamahaGuide
} from "../apps/motorleads/app/brand-guides";

const app = "apps/motorleads/app";
const read = (path: string) => readFileSync(path, "utf8");
const guides = [hondaGuide, yamahaGuide, bmwGuide, piaggioGuide, suzukiGuide, kawasakiGuide, triumphGuide, harleyGuide, ktmGuide, royalEnfieldGuide];

test("all ten brand guides have distinct routes, H1s and substantive brand-specific content", () => {
  assert.equal(guides.length, 10);
  assert.equal(new Set(guides.map(guide => guide.path)).size, 10);
  assert.equal(new Set(guides.map(guide => guide.h1)).size, 10);

  for (const guide of guides) {
    assert.ok(existsSync(`${app}${guide.path}/page.tsx`), `${guide.path} page is missing`);
    assert.ok(existsSync(`apps/motorleads/public${guide.logo}`), `${guide.brand} logo is missing`);
    assert.ok(guide.overview.join(" ").length > 300, `${guide.brand} overview is too short`);
    assert.equal(guide.families.length, 4);
    assert.ok(guide.evidence.length >= 6);
    assert.ok(guide.faqs.length >= 3);
    assert.ok(guide.families.some(family => !family.name.includes(guide.brand)));
  }
});

test("brand pages publish unique metadata and use canonical shared guide markup", () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();

  for (const guide of guides) {
    const source = read(`${app}${guide.path}/page.tsx`);
    const match = source.match(/pageMetadata\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\)/);
    assert.ok(match, `${guide.path} metadata is missing`);
    assert.equal(match[3], guide.path);
    assert.ok(!titles.has(match[1]), `duplicate title: ${match[1]}`);
    assert.ok(!descriptions.has(match[2]), `duplicate description: ${match[2]}`);
    titles.add(match[1]);
    descriptions.add(match[2]);
    assert.match(source, /<BrandGuide guide=/);
  }

  const component = read(`${app}/components/brand-guide.tsx`);
  assert.match(component, /<Breadcrumbs/);
  assert.match(component, /<h1>{guide\.h1}<\/h1>/);
  assert.match(component, /alt={`\$\{guide\.brand} logo`}/);
  assert.match(component, /<ValuationCta compact/);
  assert.match(component, /not endorsed by, sponsored by or affiliated with/);
});

test("brands hub links every guide and the four core seller resources", () => {
  const hub = read(`${app}/motorcycle-brands/page.tsx`);
  for (const guide of guides) assert.match(hub, new RegExp(guide.path.replaceAll("/", "\\/")));
  for (const guide of guides) assert.match(hub, new RegExp(guide.logo.replaceAll("/", "\\/")));
  for (const path of ["/sell-my-motorbike", "/motorbike-valuation", "/how-to-sell-a-motorbike", "/valuation"]) {
    assert.match(hub, new RegExp(path.replaceAll("/", "\\/")));
  }
});

test("sitemap includes the hub and all ten canonical brand routes", () => {
  const sitemap = read(`${app}/sitemap.ts`);
  assert.match(sitemap, /"\/motorcycle-brands"/);
  for (const guide of guides) assert.match(sitemap, new RegExp(`"${guide.path.replaceAll("/", "\\/")}"`));
  assert.doesNotMatch(sitemap, /"\/seller|"\/api/);
});
