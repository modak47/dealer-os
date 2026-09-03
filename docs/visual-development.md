# DealerOS Visual Development Workflow

This repo has a permanent Playwright workflow for frontend visual development. It lets Codex and developers open authenticated development routes, capture screenshots at standard viewports, run accessibility checks, and compare against deliberately approved references.

## Commands

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Start normal local development | `npm run dev` |
| Start visual development mode | `npm run dev:visual` |
| Run all functional tests | `npm test` |
| Run all visual regression tests | `npm run test:visual` |
| Run one visual file | `npm run test:visual -- tests/visual/admin-stock.visual.spec.ts` |
| Open Playwright UI mode | `npm run test:visual:ui` |
| Run headed browser checks | `npm run test:visual:headed` |
| Produce candidate screenshots | `npm run test:visual:candidates` |
| Review failure report | `npx playwright show-report design-references/report` |
| Deliberately approve updated screenshots | PowerShell: `$env:CONFIRM_VISUAL_BASELINE_UPDATE="1"; npm run test:visual:update` |
| Run accessibility checks | `npm run test:accessibility` |

`npm run dev:visual` uses port `3100` by default, reports `http://127.0.0.1:3100`, and detects when that port is already serving the app. Override with `DEALEROS_VISUAL_PORT`.

## Environment Variables

Copy `.env.example` to `.env.local` for normal local development. The visual workflow does not require production credentials.

Visual-mode variables:

| Variable | Purpose |
| --- | --- |
| `DEALEROS_VISUAL_TEST_MODE=1` | Enables non-production visual fixtures and visual auth only. |
| `DEALEROS_VISUAL_TEST_SECRET` | Optional shared header secret. Defaults to `dealeros-visual-dev`. |
| `DEALEROS_VISUAL_PORT` | Optional visual server port. Defaults to `3100`. |
| `PLAYWRIGHT_BASE_URL` | Optional URL when testing an already-running server. |

Never commit real passwords, API keys, production Supabase credentials, Stripe secrets or private customer data.

## Authentication

Visual tests use a development-only request header (`x-dealeros-visual-test`) while `DEALEROS_VISUAL_TEST_MODE=1` is enabled. The middleware accepts that header only outside production. This is not a production bypass and must not be wired into normal navigation or deployed credentials.

When Supabase test credentials are available, add a Playwright setup project that signs in with a dedicated seeded development account and saves `storageState`. Keep that account restricted to test data.

## Test Data

The first visual fixture is in `lib/supabase-stock.ts` under `visualStockFixtures`. It covers realistic stock cards with:

- In stock, reserved, sold and prep statuses
- Long motorcycle model names
- Long variant/location/notes text
- Missing image state
- Price, mileage and registration values
- A controlled hidden test record

Future seeded data should add valuation, dealer lead, collection, payment, V5, loading, empty and error states listed in the project brief.

## Screenshot Locations

| Artifact | Location |
| --- | --- |
| Approved references | `design-references/approved/` |
| Candidate screenshots from current build | `design-references/current/` |
| Failed comparisons, traces and videos | `design-references/failures/` |
| HTML visual test report | `design-references/report/` |
| Temporary developer captures | `design-references/tmp/` |

Approved screenshots are source-of-truth artifacts. Do not run the update command just to make a failing test pass. Review the visual difference first, then approve with `CONFIRM_VISUAL_BASELINE_UPDATE=1`.

## Standard Viewports

Every material frontend change should be checked at:

- Desktop: 1440 x 900
- Laptop: 1280 x 800
- Tablet portrait: 768 x 1024
- Mobile: 390 x 844

The current visual spec covers `/admin/stock` at all four sizes.

## Current Coverage

Initial automated visual coverage:

- `/admin/stock`: authenticated admin shell, stock filter controls, stock card grid, image and missing-image states, status badges and responsive admin navigation.

The test also checks:

- Serious or critical axe accessibility violations
- Horizontal overflow
- Unnamed interactive controls
- Browser console errors
- Failed requests and server errors

## Design-System Inventory

Canonical implementation locations:

- Page shell and admin layout: `app/admin/admin-shell.tsx`, `app/admin/admin-sidebar.tsx`
- Page heading wrapper: `AdminPage` exported from `app/admin/dashboard/page.tsx`
- Shared public header/footer/forms: `app/components/`
- Stock cards and filters: `app/admin/stock/admin-stock-client.tsx`
- Dealer portal cards, tabs, modal patterns and states: `app/dealer-portal/portal-client.tsx`, `app/admin/dealer-portal/page.tsx`
- Customer portal panels and form controls: `app/portal/portal-client.tsx`
- Global design tokens and utilities: `app/globals.css`

Current token/style conventions:

- Colours are CSS custom properties and global classes in `app/globals.css`, including `--green`, status reds and dark panel backgrounds.
- Typography uses `--display` for headings and `--body` for interface/body text.
- Cards generally use dark backgrounds, 1px borders, 4-8px radius and compact spacing.
- Responsive admin layout switches to drawer and bottom navigation under the existing mobile media queries.
- Status badges use the `.status` pattern with modifier classes such as `.reserved`, `.sold`, `.prep` and generated stock status classes.

Potential duplicate areas to review later:

- Button styles exist as `.admin-primary`, `.admin-secondary`, `.btn.green`, route-local `.primary` and portal-specific button classes.
- Card styles are repeated across dashboard panels, stock cards, CRM panels, dealer portal cards and customer portal cards.
- Form label/input styles are repeated across admin, portal, stock editor, sales wizard and address lookup sections.

No broad component refactor was done as part of visual-test setup.

## Future UI Task Workflow

Before implementation:

1. Identify affected routes and important user states.
2. Open the current rendered page with Playwright.
3. Review supplied reference images and approved baselines.
4. Locate canonical components and tokens.
5. Confirm which standard viewports apply.

During implementation:

1. Make a focused change.
2. Avoid unrelated component or layout changes.
3. Reload the actual page.
4. Inspect the result at relevant states.
5. Correct obvious overflow, spacing, wrapping and alignment issues.

Before completion:

1. Inspect desktop, laptop, tablet and mobile.
2. Check normal and important alternative states.
3. Check overflow, wrapping, spacing and alignment.
4. Check console errors and failed network requests.
5. Run relevant tests.
6. Capture final screenshots.
7. Compare with approved references.
8. Iterate on material differences.
9. Report exactly what was verified.

## Troubleshooting

- If Playwright cannot find a browser, run `npx playwright install chromium`.
- If port `3100` is busy, set `DEALEROS_VISUAL_PORT` to another port or stop the existing server.
- If screenshots differ because the UI intentionally changed, generate candidate screenshots, review them, then approve deliberately.
- If tests fail from external images, keep network assets mocked or replaced with deterministic local fixtures.
- If an authenticated DB-backed route is needed, use a seeded development account or test-only Supabase project. Do not add production credentials.
