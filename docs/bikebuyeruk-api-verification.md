# BikeBuyerUK API activation and verification

Activated on 21 October 2026 at:

`https://dealer-os-ten.vercel.app/api/integrations/bikebuyeruk/leads`

Production deployment: `dpl_CVbcKZMUsAVt8bhXaXgGGau7C7Se`.

The production release was built from the actual source archive of the previous live deployment (`dpl_3QotFWdjxRjp94E9ZDZbDHeETZeL`) with only the BikeBuyerUK integration, documentation, environment example and tests overlaid. Unrelated working-tree changes were excluded. No database migration or MotorGeeks website deployment was needed. The existing source/submission unique index and durable rate-limit RPC were verified by actual calls.

## Live acceptance

| Check | Result |
| --- | --- |
| Authenticated connection metadata | 200 |
| Wrong credential | 401 |
| Valid dry-run submission | 200; no lead row created |
| Missing privacy/terms acceptance | 400 |
| New synthetic submission | 201; lead #1617 |
| Identical retry | 200; duplicate true, same ID |
| Changed payload under the same ID | 409; original lead preserved |
| Database reconciliation | Exactly one row; `bike_buyer_uk`, `bikebuyeruk`, `new`, `direct_claim`; not ready/released |
| Creation audit event | Exactly one `master_lead_created` event |
| BikeBuyerUK credential used against staff lead list and detail APIs | Both 401 |
| Cleanup | Synthetic local acceptance lead #1611 and production lead #1617 archived, with cleanup audit events |

## Automated checks

- `npx tsx --test tests/bikebuyeruk-leads.test.ts tests/website-lead-webhook.test.ts tests/website-leads-api.test.ts tests/website-leads-access.test.ts tests/website-leads-pagination.test.ts tests/staff-lead-workflow-views.test.ts tests/seller-handlers.test.ts tests/seller-database.test.ts` passed (55 checks at the initial run). The BikeBuyerUK suite was rerun after adding the historical-ID collision test: all 11 checks passed, bringing the covered total to 56.
- `node --test tests/bikebuyeruk-client.test.mjs`: all 6 checks passed, covering success, duplicates, dry runs, validation/auth/conflict failures, throttling, outages and timeouts.
- `npm run typecheck`: passed.
- Targeted ESLint on the route, mapper, tests and supplied client: passed.
- `npm run test:visual -- tests/visual/website-leads.visual.spec.ts --grep "website usable at (1440|1280|768|390)"`: all 4 checks passed, including accessibility, overflow, browser errors and failed-request assertions.
- Vercel production `npm run build`: passed compilation, TypeScript and static generation; deployment ready and production alias verified.

## Rendered UI checks

Inspected `/website-leads` before editing, using the existing Playwright fixture test. After implementation, used the actual new local HTTP endpoint to save synthetic lead #1611 in the shared database, then read that lead through the real staff list/detail APIs using the existing development-only visual header.

Visually reviewed Playwright screenshots of `/website-leads` and `/website-leads/1611` at **1440×900**, **1280×800**, **768×1024** and **390×844**. Checked Bike Buyer UK filtering, Needs review status, long model text, no registration, zero mileage, missing asking price, zero photos, customer details, list-to-detail navigation, existing headers/sidebar/mobile navigation and horizontal overflow. Existing visual tests additionally cover surrounding fixture cards and filter controls. No approved screenshots were changed.

The synthetic lead has no referral history. Its referral-history read was isolated to an empty response during the local visual pass because that existing endpoint requires an actual staff login and intentionally does not accept the read-only visual header. All intake, database, list and lead-detail data checks used the real endpoints. No production authentication rule was weakened. The completed controlled visual pass had no console errors, failed requests or HTTP errors, and no serious/critical accessibility findings in the lead browser.

Evidence is under `tmp/bikebuyeruk-api/`: `live-acceptance.json`, `local-acceptance.json`, `release-manifest.json` and the `submitted-*.png` screenshots. The initial visual pass exposed the expected referral-auth restriction; the final pass isolated that read as described above. The checked code is also in the main workspace for future releases.

## Remaining integration work

The DealerOS receiving side is live and configured. BikeBuyerUK's developer still needs to implement its form backend/outbox, privately install the supplied key on its hosting, and connect the form using the handover guide. The actual BikeBuyerUK website/CMS is not available in this workspace, so its form has not been tested or deployed here.

This connection receives completed leads. Registration lookup, file hosting, draft restoration, seller accounts and seller-offer messaging are separate capabilities and are not supplied by this API.
