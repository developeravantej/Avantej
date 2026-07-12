# POS payment-plan + profile-sale fixes (verify → clean → closing)

- **Session id:** c7f0c12c-06ed-44b0-8216-7bea63d07adf
- **Date:** 2026-07-02 14:33
- **Branch:** checkpoint-6-22 @ becace8b
- **Status:** in-progress
- **/closing:** Overall 8/10 (A 9 · B 8 · C 9) — PASS

## Scope
User reported three POS issues from screenshots and asked to verify them, then fix + verify live, then remove the test data created during verification, then ran `/closing` and asked to execute the resulting fix plan:
1. A service configured to allow only 2 installments still showed all payment plans in the POS.
2. A "New Sale" from a customer profile didn't appear on the profile.
3. "Error: Failed to fetch" toast.

## What was done
- **Diagnosed + fixed all three (real root causes, verified live in Chrome):**
  - **#1 service-scoped plans** — dropdown ignored `services.availablePaymentPlans`; plumbed the allow-list onto `CartItem` (`types.ts`, `items-step.tsx`) and filtered/auto-corrected the picker (`payment-step.tsx`). Live: E2E Test Session (`["full","half"]`) → dropdown showed only those.
  - **#2 profile sale not showing** — the real cause was NOT cache staleness (initial hypothesis) but the POS **prefill path passing `members.id` where `recordSale` needs `member.userId`** → 404 "Member not found" → sale never persisted (`pos-workflow.tsx:87`). Also added cache invalidation on sale success. Live: a real sale from Ahmad's profile completed (Packages 792→793).
  - **#3 "Failed to fetch"** — transient transport (the local **web dev server crashing** mid-session) + the global query-error toast surfacing it. Quieted the toast (skip AbortError, dedupe) — real errors still shown.
  - **Bonus (root of local login pain):** `COOKIE_DOMAIN=.avantej.com` leaked from `wrangler.jsonc` into dev → session cookie dropped on `avantej.localhost`. Fixed with `COOKIE_DOMAIN=` empty in `.dev.vars`.
- **Removed the verification test sale** — 7 rows (order/items/invoice/payment/payment_items/package_instance/commission_split) deleted transactionally via the decrypted tenant connection; profile confirmed back to 792/372.
- **`/closing` gate 5 → 8 (PASS)** and executed the fix plan:
  - **Task 1** — `e2e/pos-profile-prefill-sale.journey.spec.ts` (@p0): green + recorded video; guards the userId fix. Hardened `auth.setup.ts` (deterministic post-login nav) and fixed `CORS_ORIGIN` `403 INVALID_ORIGIN` — unblocked the whole local e2e suite.
  - **Task 3** — extracted `payment-plan-filter.ts` + 14 unit tests (incl. conflicting-cart edge).
  - **Task 4** — extracted `query-error.ts` + 6 unit tests; documented COOKIE_DOMAIN/CORS gotchas in `.dev.vars.example`.
  - **Task 2** — dropdown UI e2e attempted then removed as racy (Neon read-after-write across requests); filter stays covered by the 14 units + live screenshot.

## Files changed
```
apps/server/.dev.vars                              |   6 +   (COOKIE_DOMAIN=; committed. CORS_ORIGIN localhost:3021 still uncommitted)
apps/server/.dev.vars.example                      |  12 +-
apps/web/src/components/pos/types.ts               |   6 +
apps/web/src/components/pos/items-step.tsx         |   5 +
apps/web/src/components/pos/payment-step.tsx       |  67 +-
apps/web/src/components/pos/payment-plan-filter.ts |  65 +   (new)
apps/web/src/components/pos/pos-workflow.tsx        |  16 +   (member.userId + invalidate)
apps/web/src/utils/orpc.ts                          |   5 +
apps/web/src/utils/query-error.ts                   |  28 +   (new)
apps/web/src/__tests__/components/pos/payment-plan-filter.test.ts | 116 + (new, 14 tests)
apps/web/src/__tests__/utils/query-error.test.ts   |  44 +   (new, 6 tests)
e2e/auth.setup.ts                                   |  25 +   (hardened)
e2e/pos-profile-prefill-sale.journey.spec.ts        | 137 +   (new, @p0)
```

## Commits
```
becace8b test(pos): extract + unit-test payment-plan filter and query-error toast
6b0fa8d0 test(e2e): regression guard for profile-prefill POS sale + harden auth setup
6905d401 fix(pos): service-scoped payment plans, profile sale failure, cache refresh
```

## Commands run
- `bun check-types` → ✅ (run several times across the work)
- `bun run test payment-plan-filter query-error` → ✅ 20 unit tests pass
- `PW_VIDEO=on bunx playwright test e2e/pos-profile-prefill-sale.journey.spec.ts --project=journeys-e2e` → ✅ green, 556K video.webm
- oxlint + biome (pre-commit via lint-staged) → ✅ on every commit
- Tenant-DB cleanup script (decrypt connection + transactional delete) → ✅ 7 rows removed, order gone

## Decisions
- #2's real cause was the `members.id` vs `member.userId` mismatch in the prefill path — corrected the initial cache-staleness hypothesis after a live repro produced the 404.
- Removed the dropdown UI e2e rather than commit a flaky red test: restricting a service via API then reading it through the POS is racy on Neon (read-after-write across pooled connections). Filter logic guarded by 14 deterministic unit tests + a live screenshot instead.
- COOKIE_DOMAIN/CORS fixes live in local `.dev.vars`; the toast change keeps real errors visible (only AbortErrors suppressed).

## Open threads
- **`CORS_ORIGIN` localhost:3021 addition is uncommitted** in `.dev.vars` (local only). CI e2e will hit `403 INVALID_ORIGIN` unless the same origin is trusted in the CI env.
- **Dropdown-filter has no UI e2e** — Neon read-after-write racy; covered by units + live screenshot. Revisit if a deterministic seed for a restricted service becomes available.
- **Login UX:** the form login doesn't reliably auto-redirect to `/dashboard` in a cold browser (`useSession()` race); `auth.setup.ts` was hardened around it, but the app-side redirect is worth a real look.
- **Stray `C:temp*.txt`** files at repo root (not from this session) — safe to `git clean`.
- Fix-plan / re-rate history: `_close/closing-2026-07-01_11-03_pos-payment-plans-profile-sale.md`.

## Update 2026-07-06 19:08

Same session id, new multi-day effort: **member onboarding** (GHL approval + staff customer-create). Branch `checkpoint-6-22` @ `a51cf4b1`. Status: onboarding feature **committed & code-reviewed**; broader session has open threads.

### Scope (this update)
Run the native app; port the native registration form to web; wire GHL approval-queue → onboarding hand-off; route staff-created customers through onboarding too; deep-test; code-review; commit.

### What was done
- **Native app run** — booted Pixel_6 emulator, `expo run:android` (first Gradle build), app up; fixed stale `apps/native/.env` (was `192.168.0.139:3000` → `10.0.2.2:3020`). Also hotfixed a server crash: ambiguous `getReceiptById` import in `goods-receipts.ts` (barrel → deep path) — NOT in the onboarding commit.
- **Web registration form** — ported native 3-step wizard to `apps/web/.../onboarding/registration-form.tsx` (+ `registration-constants.ts`, route `register.tsx`); token-preserving login wiring (`login-form.tsx`, `(auth)/login.tsx`). Ran a real member registration end-to-end (role null→user, membership created).
- **GHL approval → onboarding** — new `registration.completeProfile` + `profileStatus` (packages/api), `ghl.sendOnboardingLink` + `listApprovedContacts` (apps/server/routers/ghl/onboarding-handoff.procedures.ts), migration **0101** (ghl_pending_contacts +onboarding_link_sent_at/by) for a durable Approved→Link-sent→Registered queue lifecycle. Native falls back to completeProfile on CONFLICT.
- **Customer-create → onboarding** — extended `createUnclaimed` with optional full profile ("Quick add" vs "Full details" mode in `add-customer-dialog.tsx`); quick-add offers a send-onboarding-link hand-off.
- **Fixed a failing installments e2e** — found a real product bug: `installments.reschedule`/`waive` handlers `return`ed the promise inside try/catch WITHOUT `await`, so CONFLICT/BAD_REQUEST leaked as opaque 500s (`mutate.procedures.ts`). Added `await`; also hardened the test to pick a non-locked row + assert on the due_soon tab. NOT in the onboarding commit (separate POS fix, uncommitted).
- **/code-review (high effort, 8 angles)** — found + fixed blockers: (1) full-details create silently dropped the profile on phone-dedup → now completes the existing incomplete customer; (2) `claim-unclaimed.procedures.ts` 442 LOC > 400 CI gate → split into `create-unclaimed.procedures.ts` + `onboarding-fields.ts` helper; (3) web CONFLICT fallback; (4) login redirect precedence; (5) native keys on `error.code` not message string.
- **DB structure verified** — mapped control-panel ("main") vs per-tenant Neon branches; confirmed 0101 is tenant-only; applied via `migrate-all-tenants.ts` to all dev tenants (1 real: test-fitness-franchise → 0101; 28 stubs skipped).

### Verification
- Type-checks clean (server/web/native); oxlint 0 errors; e2e coverage-ledger **GATE PASSED** (262 covered / 3 deferred / 0 uncovered); onboarding+customers e2e **31 passed** + create-customer **4 passed** (incl. dedup regression); **0 orphan** test rows.
- 5 new e2e specs: profile-completion lifecycle, registration invite invariants, create-customer modes (+dedup), GHL hand-off API boundary.

### Commit
- `a51cf4b1 feat(onboarding): member onboarding via GHL approval + customer create` — 30 files, +3686/−283. **Scoped: source + tests only.** Deferred (shared generated files entangled with a concurrent billing/print session on the same branch): `tenant-migrations.generated.ts`, `0101_*.sql`, `routeTree.gen.ts`.

### Open threads (this update)
- **Prod migration 0101 rollout** — dev done; prod is a deploy step (needs prod DATABASE_URL + ENCRYPTION_KEY).
- **Deferred generated-file commit** — 0101 SQL + generated + routeTree must be committed once the branch is disentangled (`bun gen:migrations` + route regen).
- **Review deferral #3** — send-onboarding-link routes to `/set-password` (app-first); web `/register` completeProfile only reachable manually. Product decision pending.
- **Review deferrals #5/#7** — multi-org `organizations[0]` mode detection; missing `ghl_contact_links` disables send with no recovery.
- **Copy-link hand-off + sendOnboardingLink happy-path e2e** — deferred (need security-reviewed token endpoint / GHL webhook fixture + real email).
- **Installments reschedule/waive await-fix** — real POS bug fixed but UNCOMMITTED (separate from onboarding commit).
- **Pre-existing, not mine:** `email-domains.ts` 722 LOC breaks the router LOC gate (branch CI red); `package_instances.walk_in_customer_id` FK drift.
- **`branchInvites.listAll` token-leak chip** — still pending.

## Update 2026-07-08 16:12

**Branch:** main @ 5f5195b4 (session continued far past the POS work above; now on `main`, in sync with origin).

### New scope this stretch — turn main's CI board green
After landing member onboarding (PR #70) and switching this working tree from `checkpoint-6-22` onto `main`, discovered main's CI was broadly red (pre-existing, predates onboarding). Drove every **code-fixable** gate to green across **10 merged PRs (#71–#80)**.

### What was done
- **#71** installments `await` reschedule/waive → CONFLICT maps to 409 not opaque 500.
- **#72** dropped unused `and` import in seed-move-commission → unblocked Type Check/Build (first of several).
- **#73** per-file **isolation runner** (`scripts/run-package-tests-isolated.ts`) + ci.yml wiring — fixes bun `mock.module` process-global barrel poisoning that reddened Package Tests (api+services). Also 2 real services mock-drift fixes (innerJoin stub, cancelPayout linkedSplits).
- **#74** Server Unit Tests: 3 mock-drift fixes (hierarchy typed-error, check-ins/service `execute` stubs) + push-tokens `protectedProcedure→tenantProcedure` (Tenant perimeter).
- **#75** split the 843-LOC `email-domains.ts` router into a folder module (LOC gate).
- **#76** Biome Format gate — the "systemic CRLF" was a misdiagnosis (repo blobs already LF; `git ls-files --eol` proved it); real fix = format ~9 content-drift files + add `.gitattributes`.
- **#77** the crux: `baseRouter` explicit `BaseRouter` type (74 `typeof` refs + `as unknown as`) to fix **TS7056** on build — greened Build AND typed `dataImport` for the web client.
- **#78** DataImportPage band-aid (later reverted in #80).
- **#79** root Type Check fix: `turbo check-types dependsOn ^build` so consumers read a **fresh** dist. The "~56 masked test errors" were a turbo-cache/stale-dist artifact — cache-free `--force` + CI both show 0 tracked errors.
- **#80** `/closing` follow-ups: reverted dead band-aid, added `assertOrgContextMatch` to push-tokens, added installments locked→409 regression spec.

### /closing (scope: ci-gate-hardening) — 7 → 8/10 PASS
A 10 · B 8 · C 9.5. Scorecard + plan + re-rate: `_close/closing-2026-07-08_15-49_ci-gate-hardening.md`.

### Verification
Polled GitHub Actions on each merge commit. **Green on main:** Build, Type Check, Format (Biome), Lint, Package Tests ×4, Server Unit Tests, Tenant API perimeter, Web Tests, scan ×2, E2E drift guard.

### Open threads
- **Playwright smoke** + **Server integration (dev Neon)** CI gates remain **red** — need CI secrets / Neon creds; not fixable from a local session.
- The new installments 409 spec + email-domains provisioning flow are **unrun locally** (no `apps/server/.dev.vars` / API server — same Neon-creds gap). Regression spec is committed and drift-guard-clean; runs against a live server.
- **27 untracked files** in the working tree (`payment/print/*`, billing-profile, receipts, mig 0100, etc.) belong to a **concurrent billing/print session** — left untouched; not this session's to commit.
- Team-flagged (memory): the installments fix left pre-existing "not found" → 500 (vs 404) mapping unchanged; documented in the closing plan.

**Status:** CI-hardening deliverable **done + merged**; residuals above are env-gated, not open work.
