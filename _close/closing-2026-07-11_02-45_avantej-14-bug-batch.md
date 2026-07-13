# /closing — AVANTEJ 14-bug batch (PRs #81/#82/#83)   ·   Overall: 3/10 · NEEDS WORK

What was done: 14 AVANTEJ tickets fixed across 3 stacked branches (surface audited: **committed diff `main...HEAD`** on `wilfred/avantej-16-opening-hours`, 40 files +1200/−75). Refund double-count (9), report date ranges (8), active-members count (7), branch counter rollup (14) + opening-hours feature (16), Add-Customer CSS (11), appointment duration (6) + visibility (5), refund/list-refresh (12/17), delete tooltip (13), UI-freeze perf (10), credit deduction (15), trustedOrigins split (18).

```
A. Edge cases     5/10  ⚠️  two HIGH defects in the new fixes + several medium gaps
B. E2E + video    4/10  ⚠️  only AVANTEJ-9 has an in-suite spec + video; 10/14 have no executable guard, 8/14 no visual proof; 3 proof scripts leak/mutate real data
C. Best approach  7/10  ⚠️  idiomatic + clean migration hygiene, but one silent no-op + one client-side band-aid

Overall = min(5,4,7)=4, −1 (two checks <7) = 3/10
Gate: NEEDS WORK
```

Two independent checks (A + C) + my own verification agree: **AVANTEJ-15 as shipped does nothing** (credits never deduct), and it's a *closed* ticket on an open PR. That alone caps the gate.

---

## BLOCKING (fix before the PRs merge)

### 1. AVANTEJ-15 credit deduction is a silent no-op — field-name mismatch  [lifts A, C]
**What's wrong:** `apps/web/src/hooks/useAppointmentFormState.ts:42` types `PackageInstanceItem.packageInstanceId`, and `:239` returns `match?.packageInstanceId ?? null`. But `orpc.packageInstances.listAll` → `listAllPackageInstances` → `toCamelPackageInstanceRow` (`packages/services/src/package-instance.service.ts:577`) emits the id as **`id`**, not `packageInstanceId`. So `match.packageInstanceId` is always `undefined` → `selectedPackageInstanceId` is always `null` → the deduction branch at `appointment.service.ts:429` never runs. **Verified** (`toCamelPackageInstanceRow` returns `id: r.id`). The `as PackageInstanceItem[]` casts (`:218,:232`) suppressed the compile error.
**Fix:** `useAppointmentFormState.ts:42` `packageInstanceId: string` → `id: string`; `:239` `match?.id ?? null`. Prefer dropping the `as PackageInstanceItem[]` casts and using the inferred oRPC output type so the compiler validates field names.
**Verify:** extend `_e2e/avantej16-proof.mjs`-style script or `_e2e/web/booking/booking-credits.rule.spec.ts`: create a form booking against a package with N credits via `/rpc` → assert `credits_remaining` = N−1 (fails on current code — stays N). → **A/C to 8+.**

### 2. AVANTEJ-9 "already fully refunded" guard has a dead fallback  [lifts A]
**What's wrong:** `packages/services/src/refunds.service.ts:944`: `(order.refundedAmountCents ?? order.cancelledAmount ?? 0) >= order.totalAmount`. `sales-orders.ts:76` `refundedAmountCents` is `.notNull().default(0)` → **never null**, so `?? order.cancelledAmount` is dead. A genuinely cancelled order (`cancelSalesOrder` sets `status='cancelled'` + `cancelledAmount`, leaves `refundedAmountCents=0`) evaluates `0 >= total` = false → `processRefund` proceeds and re-writes `refundedAmountCents = cancelledAmount + amount` (can exceed total), re-subtracting from Net Collected — the same double-count, from the cancellation side. The old `status==='cancelled'` guard blocked this.
**Fix:** guard on the real signals, e.g. `if (order.status === "cancelled" || order.refundStatus === "processed" || Math.max(order.refundedAmountCents ?? 0, order.cancelledAmount ?? 0) >= order.totalAmount)`.
**Verify:** unit/API: approve+process a refund against a cancelled order → expect BAD_REQUEST "already fully refunded". → **A to 7+.**

---

## HIGH (raises the proof floor — B is the weakest dimension)

### 3. Add API-boundary regression assertions for the automatable backend fixes  [lifts B]
None of these need Radix; all are automatable. Add specs (copy the `_e2e/playwright.avantej9.config.ts` + `global-setup.api.ts` pattern, or unit where noted):
- **AVANTEJ-18** — unit on the `trustedOrigins` builder: `CORS_ORIGIN="https://a,https://b"` → both present, and empty string → localhost default retained (see LOW-10). `cd apps/server && bun test`.
- **AVANTEJ-14** — API: org-root counter == Σ descendant counts (consistency). New `_e2e/web/branch/overview-rollup.rule.spec.ts`.
- **AVANTEJ-6** — API: create appt for a 60-min service → `getById.duration === 60`.
- **AVANTEJ-7** — API delta: seed 1 customer_profile w/ active package → `activeMembersCount` +1.
- **AVANTEJ-8** — unit on the preset→range mapper: `7D/30D/90D/YTD` all give `to <= now`.
- **AVANTEJ-12 / AVANTEJ-17** — vitest with mocked `queryClient`: assert `invalidateQueries` called with `orpc.<router>.list.key()` prefix.
- **AVANTEJ-13** — vitest render: unclaimed profile → disabled Delete exposes tooltip text.

### 4. Fix leaking / destructive proof scripts  [lifts B, hygiene]
- `_e2e/avantej16-proof.mjs` **permanently overwrites a real branch's opening hours** with no restore — wrap in `withRestored` (`_safe-mutation.ts:53`) or capture+restore the prior value.
- `_e2e/web/sales/net-collected-refund.rule.spec.ts` and `_e2e/avantej5-proof.mjs` create real sales/appointments with **no teardown** — add `Cleanup`/`afterEach` per `_safe-mutation.ts:36-51`. (`avantej5-proof.mjs:111` also asserts `created.serviceId` — read the persisted row instead.)

---

## MEDIUM

### 5. AVANTEJ-16 zod accepts invalid hours  [lifts A]
`packages/api/src/routers/hierarchy/update.procedures.ts:41`: `z.record(z.string(), …)` allows arbitrary day keys, non-`HH:MM` strings, and `open > close`. Constrain: `z.enum([monday…sunday])` keys, `.regex(/^\d{2}:\d{2}$/)` on open/close, and `.refine(open < close)`.

### 6. AVANTEJ-7 scoped count excludes comped/migrated customers  [lifts A]
`analytics.service.ts:225` requires a `sales_orders` row in-branch; a customer with an active package but no sales_order (comped/admin-assigned/migrated) is dropped from the *scoped* count (org-wide path is fine). Decide: acceptable, or broaden the NAP-03 clause.

### 7. AVANTEJ-10 class-slots is a client-side band-aid  [lifts C]
`class-slots-page.tsx:91` + `SignupsDialog.tsx` only trim what Radix renders; `members.list` still fetches the whole roster (thousands) over the wire. Push a `role`/`excludeRole` filter + pagination into the members list procedure (the appointments-tab fix in this same batch did exactly this at the DB layer). At minimum add a `// TODO(AVANTEJ-10 follow-up)` + ticket.

### 8. AVANTEJ-5/10 profile Appointments tab misses class attendees  [lifts A]
`recurrence.service.ts:331,374` filter `appointments.userId = userId`; class/group enrollees live in `appointment_clients.clientId` (booking `userId` often null). Enrolled-but-not-booker appointments won't show on the attendee's profile. Consider joining/filtering via `appointment_clients`.

---

## LOW
9. **AVANTEJ-15 multi-package** (behind #1): `.find()` picks newest package (`created_at DESC`), not soonest-expiry — credits drain from the wrong pack once #1 is fixed.
10. **AVANTEJ-18 empty CORS_ORIGIN**: `""` is non-nullish → `filter(Boolean)` yields `[]`, `?? [localhost]` never fires. Add `.filter(Boolean)` result length check or `|| ""` guard.
11. **AVANTEJ-9 Cancelled-Sales tab**: fully-refunded sales no longer appear there (keyed on `status='cancelled'`); confirm the UI surfaces `refundStatus='processed'`. (Already flagged to the user.)
12. **`(typeof x)[number]` annotations** (`class-slots-page.tsx:96`, `DataImportPage.tsx:492`): workaround for the stale-dist type gap; fix at source (`^build`) if pursued.

---

## Verification (run after fixing)
```
# stack up (per project_e2e_local_run_setup): server :3020 + web :3022
bun dev:server ;  (cd apps/web && SERVER_PORT=3020 bunx vite --port 3022 --strictPort)

# existing executable proofs
PLAYWRIGHT_BASE_URL=http://localhost:3022 bunx playwright test --config _e2e/playwright.avantej9.config.ts
BASE=http://localhost:3022 node _e2e/avantej5-proof.mjs
BASE=http://localhost:3022 node _e2e/avantej16-proof.mjs
cd apps/server && bun test src/tests/unit/services/analytics.test.ts

# after adding #3 specs
cd apps/server && bun test        # trustedOrigins, (backend units)
cd apps/web && bun test           # date-range mapper, query-key invalidation, tooltip
PLAYWRIGHT_BASE_URL=http://localhost:3022 bunx playwright test --config <new configs>   # rollup, duration, credit-deduction

# re-record batch video
BASE=http://localhost:3022 ROUTES="/dashboard/sales/view,/dashboard/reports/view,/dashboard/overview,/dashboard/branch/view,/dashboard/customers/v2/view,/dashboard/appointment/class-slots/view" LABEL=avantej-batch-walkthrough node _e2e/proof-capture.mjs

# re-rate
/closing avantej 14-bug batch
```

---

## Re-rate 2026-07-11 (after blocker fixes) — Overall: 3 → 5 · still NEEDS WORK

Commit `5294971e`. Fixed: AVANTEJ-15 field-name no-op, AVANTEJ-9 dead-fallback guard, AVANTEJ-18 helper+unit test (5/5 green), empty-CORS_ORIGIN default, and the destructive avantej16-proof (now restores). All type-check clean.

| Check | Before | After | Delta |
|---|---|---|---|
| A. Edge cases | 5 | **7** | both HIGH defects fixed (#1 no-op, #2 guard) + LOW #10 empty-CORS. Remaining: MEDIUM #5 opening-hours zod validation, #6 AVANTEJ-7 comped-customer undercount, #8 profile-tab class attendees. |
| B. E2E + video | 4 | **5** | AVANTEJ-18 now has an executable unit test; avantej16-proof no longer mutates a live branch. Still the ceiling: no executable guard for 6/7/8/12/13/14/17 (plan #3), and net-collected/avantej5 still lack teardown (plan #4 partial). |
| C. Best approach | 7 | **8** | the "must-fix-before-close" no-op is resolved + the AVANTEJ-18 helper extraction is cleaner. Remaining: #3 class-slots server-side filter (band-aid), #4 `(typeof x)[number]`, #5 validation. |

Overall = min(7,5,8) = 5; only one check (<7) so no −1. **5/10 — NEEDS WORK** (gate wants ≥8). The two correctness blockers are gone; **B (executable coverage) is now the sole ceiling** — reaching PASS means landing the plan's #3 (API/unit specs for the 7 uncovered fixes) and #4 (teardown on the two remaining leaky scripts).

---

## Re-rate 2026-07-11 #2 (after adding executable guards) — Overall: 5 → 6 · still NEEDS WORK

Commits `81ea058f` (specs). Added: AVANTEJ-8 pure `trailingKpiRange` helper + unit (6/6 green, asserts no future window); AVANTEJ-14 read-only rollup consistency proof (`avantej14-proof.mjs` — 14 parents, 0 violations, root=29, PASS); AVANTEJ-5 asserts serviceId from the persisted row. All green against a live stack.

| Check | #1 | #2 | Delta |
|---|---|---|---|
| A. Edge cases | 7 | **7** | unchanged (this pass added tests, not edge-case handling). Open: #5 zod validation, #6 comped-customer undercount, #8 class attendees. |
| B. E2E + video | 5 | **6** | executable guards ~doubled: now 6/14 cover the highest-risk fixes (9 Playwright+video, 8 unit, 18 unit, 14/5/16 node proofs); avantej16-proof no longer mutates a live branch; avantej5 reads persisted serviceId. Still open: no executable guard for 6/7/12/17 (automatable), 10/11/13 (screenshot-appropriate); net-collected + avantej5 still lack teardown. |
| C. Best approach | 8 | **8** | AVANTEJ-8 extraction is cleaner. Open: #3 class-slots server-side filter, #4 `(typeof x)[number]`, #5 validation. |

Overall = min(7,6,8) = 6; only one check <7 → no −1. **6/10 — NEEDS WORK** (bar is ≥8).

**Trajectory: 3 → 5 → 6.** The two correctness blockers are fixed + verified, and every high-risk fix (financial 9, counters 14, dates 8, appointments 5, auth 18, feature 16) now has an executable regression guard. Remaining to reach PASS is lower-risk backfill: executable guards for 6/7/12/17, teardown on the two leaky scripts, and the three MEDIUM edge-case refinements (16 zod validation, 7 scoped undercount, 5/10 class attendees).
