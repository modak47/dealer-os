# DealerOS Agent Instructions

## Project Shape

DealerOS is a Next.js application using the App Router, React, npm, Tailwind CSS v4 through `app/globals.css`, and local placeholder data when external services are not configured. Existing unit/integration tests use Node's test runner through `tsx --test`.

Reuse the existing route structure, components, global CSS conventions, and Supabase integration points. Do not add production credentials, weaken production authentication, rename routes, or redesign the portal unless the task explicitly asks for that work.

## Frontend Visual Validation

For every task that affects layout, styling, components or responsive behaviour:

1. Identify the exact affected routes and states.
2. Start or verify the local development server.
3. Open the current rendered page with Playwright before editing.
4. Inspect the existing shared components and design tokens.
5. Reuse canonical components rather than creating parallel versions.
6. Implement the requested change without altering unrelated screens.
7. Open the completed page with Playwright.
8. Check the relevant states at:
- 1440 x 900
- 1280 x 800
- 768 x 1024
- 390 x 844
9. Check alignment, centring, spacing, wrapping, overflow and navigation.
10. Check browser console errors and failed network requests.
11. Capture screenshots and compare against supplied or approved references.
12. Continue correcting material visual differences before completion.
13. Run relevant functional, accessibility and visual regression tests.
14. Do not declare a frontend task complete based only on compilation.
15. Report the routes, states and viewport sizes that were visually checked.

Approved reference screenshots must not be changed merely to make a failing test pass. Any reference update must be deliberate, reviewed and reported.

Use `npm run dev:visual` for a safe local visual server and `npm run test:visual` for the Playwright checks. The visual auth bypass is restricted to non-production `DEALEROS_VISUAL_TEST_MODE=1` requests carrying the configured visual-test header.

## Default Definition of Done

Every code change must end with verification that matches its risk:

- Frontend changes require both automated checks and a human visual pass with Playwright screenshots.
- Backend, data-sync, API, or database changes require the relevant unit/integration/type checks, plus a short explanation of why visual testing was or was not needed.
- Shared data changes that can affect what appears on screen count as frontend-adjacent and must include at least one rendered UI check of the affected route.
- Existing working behaviour must be checked, not only the newly added element. Confirm that surrounding cards, headers, navigation, buttons, empty states, loading states, and error states are not overlapped, clipped, hidden, duplicated, or visually shifted in a material way.
- Do not finish by saying only that tests passed. Report what was checked, what command was run, and any known gaps.

When a task changes the admin stock experience, the minimum visual check is `/admin/stock` in all standard viewports. Check the relevant stock card states: real image, broken image fallback, zero photos, reserved/in-stock badge, long make/model text, missing price, and missing mileage when those states are affected by the change.
