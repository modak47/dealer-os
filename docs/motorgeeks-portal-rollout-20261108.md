# MotorGeeks and dealer portal rollout — 8 November 2026

The reviewed migration and MotorGeeks/DealerOS code fixes have been promoted to production. Final live verification passed. Search Console remains deferred.

## Production versions

| Service | Production destination | Deployment |
| --- | --- | --- |
| MotorGeeks | https://motorgeeks.co.uk and https://www.motorgeeks.co.uk | `dpl_F8rgE3F1LSMsQZuwnoGR54Fvb1cD` |
| DealerOS / portal backend | https://dealer-os-ten.vercel.app | `dpl_9h1GESiy1NU2XKgBoSGitT7SD3hc` |
| Dealer portal wrapper | https://portal.motorgeeks.co.uk | Existing `dpl_AmjbmKu8J1yLu8xzjGPRTGT9q3Ub`; its existing rewrites serve the updated backend |

Released code is preserved on `codex/motorgeeks-portal-release-20261108`, source commit `90fbda4695a93f1cfbc2edaf02784765c762f96f`, pushed to origin. It contains the reviewed fixes plus the production-build logout navigation correction and final password-logo/button styling corrections. The working branch's implementation commit `979864a7b01b4fec0a7ef80f2ec4b0c47b5fc84e` has the identical Git tree.

The public application was packaged from its actual deployed 694-file source, with three modified application files and one added helper. All 691 untouched files retained their exact source hashes. DealerOS was released from its actual live Git base `bf52167210541b9c248f5ed514ba86a448efd741` with the reviewed changes applied in an isolated worktree. GitHub main was not used to replace newer live source.

Live inspection established that the BikeBuyerUK photo-integration commit was already deployed before this rollout. Its source was preserved. This task did not run its migration, activate its flags, replay an existing lead, merge the website PR, or change its credentials.

## Migration and configuration

Applied exactly `supabase/migrations/20261108000100_dealer_portal_completion.sql` using:

```text
npx supabase db query --remote=ejtbbpiqwytcyvromalw --file supabase/migrations/20261108000100_dealer_portal_completion.sql --yes
```

SHA-256: `00e9b7aac7506708d905313a3d86dcf852546c5c235a78d9a9baa9206f76c6ec`.

Production verification found both functions installed as SECURITY DEFINER, anonymous/authenticated execution denied, service-role execution allowed, and the membership trigger enabled. Preflight found zero dealerships over capacity and zero users active across multiple dealerships. Before/after totals remained 1,653 leads, eight offers, three purchases, three fees and two active dealer memberships. The migration performs no existing-record backfill.

The provider redirect allowlist lacked portal URLs. A reviewed, single-property Supabase configuration push preserved the two existing URLs and added:

- `https://portal.motorgeeks.co.uk/auth/callback`
- `https://portal.motorgeeks.co.uk/auth/callback?next=%2Fdealer-portal%2Freset-password`
- `https://portal.motorgeeks.co.uk/dealer-portal/reset-password`

The follow-up configuration diff showed no remaining declared changes. Site URL, confirmation requirements, MFA and the other twelve undeclared remote properties were left unchanged.

Vercel's temporary public-project automation bypass used for staged QA was revoked after testing. Existing deployment protection and the pre-existing DealerOS automation bypass were retained. No credentials were committed or printed.

## Verification

- `npm test`: 221 passed after the final code corrections.
- Root typecheck, changed-code lint and hosted production builds passed. The shared portal's existing direct-image lint advisories remain.
- The initial local full visual suite passed 71 cases; the final local portal completion suite passed all 17 after the last styling/navigation changes.
- Public hosted staging: all 130 MotorGeeks browser checks passed.
- Public live domain: all 130 checks passed using `npm run test:visual -- --config=playwright.motorgeeks.config.ts` with `MOTORGEEKS_VISUAL_URL=https://motorgeeks.co.uk`.
- Final portal hosted staging: 17 browser checks passed, including the actual compiled pages, auth form states, logout, network retry and gallery keyboard controls.
- Dealer custom domain: all 17 hosted cases passed again at `https://portal.motorgeeks.co.uk`, without a Vercel or development-auth bypass. Command: `npm run test:visual -- --config=tmp/motorgeeks-finish/hosted.config.ts --grep-invert 'accepted marketplace sale closes'`, with `QA_BASE_URL` set to the portal domain and `QA_NO_BYPASS=1`. The four additional hosted marketplace-panel cases replace the local suite's mutation-oriented cases; no production lifecycle mutations were allowed.
- Eight actual signed-out API checks across the backend and portal custom domain returned 401, including when sent the development visual-test header. Production visual authentication remains disabled.
- The new password route returns 200 and the correct MotorGeeks title through both backend and custom portal domains. Vercel alias records point to the expected deployments.

Browser checks and screenshots cover 1440×900, 1280×800, 768×1024 and 390×844. Public coverage includes the homepage, public/brand/legal pages, valuation steps, photo and consent states, contact/dealer applications and seller access. Portal coverage includes login/password setup, dashboard, direct opportunities/workspace, offer leads/workspace, My Offers, Active, Purchased, Lost/Returned, Payments, Dealership, Settings and Support, plus loading/error/retry and marketplace state panels. Human review corrected the password logo and shared button styling before portal promotion. Approved screenshot references were not changed.

Interactive hosted API/auth operations used intercepted synthetic responses; no real password emails, customer submissions, dealer invitations, purchases or charges were generated. Real email delivery and a real-identity transactional journey were not exercised. Separate unit/handler/SQL integration tests cover backend behaviour; actual production checks cover installation, permissions, data counts and signed-out isolation.

Screenshots are under `design-references/current/motorgeeks-finish/`; rollout logs, source manifests, alias verification and configuration-diff evidence are under `tmp/motorgeeks-finish/rollout/`. These temporary records are excluded from Git. Existing unrelated `.env.example` edits were preserved.
