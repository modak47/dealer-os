# MotorGeeks website and dealer portal completion — 8 November 2026

This change fixes the outstanding accessibility and account/workflow issues found in the current source. Search Console is deferred. This document records implementation and preflight; see [the production rollout record](motorgeeks-portal-rollout-20261108.md) for the subsequent migration, deployments and hosted verification.

## Result

- Public-site buttons, labels, registration prefixes and inline links have readable contrast. Keyboard focus is visible and reduced-motion preferences are respected.
- Dealer password recovery and invitations lead to `/dealer-portal/reset-password`. The form verifies the authenticated user, validates matching passwords, reports recoverable errors and returns to the dealer portal. Expired links cannot update an account. Callback destinations remain local, restricted admin/dealer paths.
- Dealer access links open the existing application form. Password visibility and remember-email controls describe their actual behaviour.
- Portal API connection failures, timeouts and non-JSON gateway responses leave a usable error/retry state. Mutation controls leave their busy state and preserve entered values. Error messages are distinct from success messages.
- Sign-out and Help work in the shared shell, including individual lead workspaces. The selected mobile navigation item stays in view. Gallery focus is contained and restored when closed.
- Accepted marketplace sales use their own status transition function. Collection updates the seller state to purchase pending. A failed sale closes the profile, preserves the accepted offer and ownership history, and creates no purchase or fee. A closed sale requires staff assistance before resuming; it is not automatically returned to other dealers. Ordinary direct first-to-claim handling is retained.
- Completed/closed seller profiles no longer display the accepted-offer handover message or permit another acceptance. Zero mileage is displayed correctly. Closed profiles do not promise future photo review/upload.
- Capacity checks run before inviting a new user and on reactivation. A database trigger serializes membership activation and enforces four active users and one active dealership per login.
- Root TypeScript excludes temporary audits/release copies, reports and screenshots. The pre-existing wording assertion now matches the current customer-facing message.

## Database change

Apply only `supabase/migrations/20261108000100_dealer_portal_completion.sql` for this change, after review and production preflight. It transactionally adds:

- `enforce_dealer_portal_membership_limit()` and a trigger on dealership membership activation/ownership changes;
- service-role-only `dealer_update_marketplace_claim(uuid,uuid,uuid,text,text,text)`.

It does not backfill, delete or rewrite existing leads, offers, memberships, purchases or fees. The marketplace RPC checks active dealer membership and ownership, locks the claim/lead, validates transitions and commits claim, seller state, note and audit together. Repeated outcomes are idempotent; purchased and closed sales cannot be reactivated by the dealer. Browser database roles cannot execute it.

The SQL was executed against disposable PGlite PostgreSQL databases. Tests cover capacity, activation, cross-dealership ownership, anonymous/authenticated denial, invalid transitions, failed-sale closure, repeated requests, purchased-state protection, direct-record preservation and rollback after an injected final-write failure. Real multi-connection production concurrency has not been exercised.

## Validation

- `npm test`: 221 passed, including actual seller handlers, marketplace fees/purchases, direct claims, staff release and the new SQL tests.
- `npm run test:visual`: 71 passed. The 130 public-site cases and four opt-in live market-data cases are skipped in this config; public cases were separately run below.
- `npm run test:visual -- --config=playwright.motorgeeks.config.ts`: 130 passed.
- Portal completion suite through the separate local `apps/motorgeeks-portal` rewrite wrapper: all 17 cases passed, including one rerun after a transient development-server 500 while builds were running. The full root suite completed without that failure.
- Actual seller page rendered with fixture identity data: accepted, purchase pending, purchased and cancelled states at four sizes, 16 checks passed. This is server-rendered fixture verification, not a production seller-session test.
- Root, public app and portal wrapper typechecks and production builds passed.
- Public app lint passed. Changed root code lint has no errors; five existing direct-image advisories remain in the shared portal component.
- `git diff --check` passed. Approved screenshot references were not changed.

Playwright screenshots and axe scans cover 1440×900, 1280×800, 768×1024 and 390×844. Portal routes: login, password setup, dashboard, direct opportunities/workspace, offer leads/workspace, My Offers, Active, Purchased, Lost/Returned, Payments, My Dealership, Settings and Support. States include failed loading/retry, failed offer submission, password mismatch/provider error/retry, expired access, gallery keyboard navigation and accepted/closed marketplace sales. Existing stock, staff leads, release and market page regression suites passed. Public tests cover the homepage, all public information/brand/legal pages, valuation steps, photos, consent, contact/dealer application errors/retries and seller access pages.

Artifacts are under `design-references/current/motorgeeks-finish/`; command logs are under `tmp/motorgeeks-finish/`. Reviewed screenshots cover desktop/mobile layout, navigation, wrapping, cards, status controls, form errors and seller outcome messages. Expected simulated API failures are intentional; final normal-state checks have no unexpected browser errors or failed requests.

## Production handoff

1. Keep the pending BikeBuyerUK rollout separate. This working branch descends from `bf521672`, which includes its unactivated photo integration. Do not deploy the entire branch or run every pending migration as an incidental part of this release. Prepare the scoped MotorGeeks/portal delta against the intended production source.
2. Read-only preflight active user counts and existing active cross-dealership memberships. Review the new migration, then apply this exact file before the new DealerOS portal code. Do not rerun previous migrations or the pending BikeBuyerUK photo migration.
3. Deploy the scoped DealerOS portal and MotorGeeks public changes. The existing portal wrapper already forwards the new route; no wrapper source edit is needed.
4. Verify Supabase's redirect allowlist covers the existing portal callback and the dealer password-completion URL. No allowlist or production auth setting was changed here.
5. Use explicitly approved synthetic identities to check real password emails/invitations, seller return, private photo storage and the staff→dealer→seller→purchase lifecycle. Browser tests use intercepted API/auth responses; they send no real emails, change no production passwords and create no customer records. Existing handler/database tests separately verify server behaviour.

Search Console, real-provider email delivery and hosted smoke testing remain separate account/rollout steps. Do not describe these local fixes as live until the migration and deployment have been completed.
