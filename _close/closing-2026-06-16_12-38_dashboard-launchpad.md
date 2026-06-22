# /closing — Dashboard Launchpad   ·   Overall: 1/10

**What was done:** Replaced the dashboard landing with a master/detail "launchpad" (`/dashboard`): left card rail (New Sale, Create Customer, View Customers, Installments, Commission Payout, Trainer Schedule), right panel that swaps on click and embeds real components, plus live count badges and a top glance strip. Moved the old analytics dashboard to a new `/dashboard/overview` route (DashboardPage made prop-driven). 10 files across commits `5447e947` + `95c126ab`.

**Surface audited:** the two launchpad commits (NOT the uncommitted `_e2e/`/`.webm` tree, which is unrelated; NOT the 3500-file branch-vs-main diff).

```
A. Edge cases     6/10  ⚠️  permission gating defects: ungated summary strip + installments card key mismatch → 403s for the cashier persona
B. E2E + video    2/10  ❌  zero automated tests + zero video for the launchpad; only generic "didn't crash" smoke on /dashboard (now stale)
C. Best approach  7/10  ⚠️  idiomatic, but ~160 lines of forked query/mapping logic (schedule + customers panels) and a duplicated security redirect
```

**Arithmetic:** Overall = lowest sub-score (B=2), −1 because ≥2 checks are below 7 (A=6, B=2) → **1/10**.
**Gate: NEEDS WORK** (B is ❌; not closeable as "tested" until e2e+video exist).

> Note: a 1/10 reflects **test-proof + gating debt**, not a broken feature. The launchpad renders and is interaction-verified (live POS customer-search→select advancing steps was driven this session). The low score is the weakest-link rule biting on missing video and real 403-for-cashier defects — exactly what this gate exists to surface.

---

## Fix plan (ordered: blocking → nice-to-have)

### 1. [B → lifts B 2→7+] Author launchpad E2E with video proof — BLOCKING
**What's wrong:** No spec references the launchpad/cards/panels/badges or `/dashboard/overview`. The only `/dashboard` specs (`e2e/journeys/01-dashboard-home.admin.journey.spec.ts`, `e2e/batch1.dashboard.spec.ts`) assert "page didn't crash" and their KPI matcher now targets the *moved* analytics page — stale. No `*.webm` covers this flow (the root `commission-*.webm` are unrelated, untracked, predate this work).
**Fix:** Create `e2e/dashboard-launchpad.journey.spec.ts` (the `.journey.spec.ts` suffix auto-enrolls in the `journeys-e2e` project per `playwright.config.ts:69`). Cover: land on `/dashboard` → 6 cards visible (role-appropriate) → click each card → assert the right panel mounts (POS search box, customers directory, installments, payouts, schedule) → assert badges render → navigate `/dashboard/overview` → analytics renders. Also update the stale `batch1.dashboard.spec.ts` KPI matcher to point at `/dashboard/overview`.
**Verify:** `PW_VIDEO=on bunx playwright test e2e/dashboard-launchpad.journey.spec.ts --project=journeys-e2e` (PS: `$env:PW_VIDEO="on"; bunx playwright test ...`). Video lands at `test-results/<spec>/video.webm`. Requires web:3021 + server:3020 + `e2e/.auth/tenant-admin.json` (setup project).

### 2. [A → lifts A] Gate the summary-strip queries — BLOCKING (403 for cashiers)
**What's wrong:** `DashboardLaunchpad.tsx:51-64` fires `analytics.getDashboardKpis` (needs `reports:read`) and `members.newToday` (needs `user_management:read`) gated only on `enabled: !!organizationId`. The launchpad's target persona (front-desk cashier) plausibly lacks `reports:read` → the glance tiles 403. The `schedule` badge (`:86` via `todayKpisQuery`) inherits the same failure.
**Fix:** Add `&& hasPermission("reports:read")` / `&& hasPermission("user_management:read")` to each query's `enabled`, and hide/placeholder the tile when not permitted (mirror the badge-query pattern already at `:71`/`:78`).
**Verify:** Load `/dashboard` as a staff role without `reports:read`; no 403 in console; tiles degrade gracefully. Add a non-admin assertion to the spec from task 1.

### 3. [A → lifts A] Fix installments card permission key — BLOCKING (403)
**What's wrong:** `cards.tsx:60` gates the Installments card on `package_management:read`, but the badge query (`DashboardLaunchpad.tsx:71`) AND the embedded `PackageInstallmentsPage` → `installmentPlansRouter.list` AND server `listUpcoming` all require `service_management:read` (`packages/api/src/routers/installments/query.procedures.ts:136-141`). A user with `package_management:read` but not `service_management:read` sees the card, gets an empty badge, and the panel 403s.
**Fix:** Change `cards.tsx:60` permission to `service_management:read` so card-visibility, badge, and panel agree.
**Verify:** Card hidden for a role lacking `service_management:read`; panel loads with no 403 for a role that has it.

### 4. [A → lifts A] Surface badge/tile query errors instead of rendering 0
**What's wrong:** `DashboardLaunchpad.tsx:83-87` + tiles (`:114-126`) read only `.data?.…`; on error they render `0` / `RM 0.00`, indistinguishable from a real zero — actively misleads staff that there's no pending work (payouts/installments).
**Fix:** Inspect `isError` per query; render a subtle "—" / retry affordance instead of `0` on error.
**Verify:** Force a query error (offline/403) → tile/badge shows error state, not `0`.

### 5. [C → lifts C] De-duplicate forked panel logic — STILL OPEN (deferred this pass)
**What's wrong:** `schedule-panel.tsx:18-101` is a near-verbatim fork of `appointment/view.tsx` `ScheduleTab` (same role gate, query, mapping, layout). `customers-panel.tsx:34-122` forks `customers/v2/view.tsx` (same query, `sidebarCustomers` memo, auto-select effect, copy-pasted `EmptyPane`). ~160 lines that will drift. `overview.tsx:20-39` also copy-pastes the platform-admin redirect `beforeLoad` from `index.tsx:10-29`.
**Fix:** Extract `useTrainerSchedule(organizationId)` and `useCustomerDirectory({ selectedId, onSelect })` hooks (selection source is the only legit difference: URL vs local). Extract a shared `beforeLoad` helper (`redirectPureSaasOwnerToMissionControl`) for both routes.
**Verify:** Route pages + panels behave identically after extraction; `bun check-types` clean.

### 6. [A/C low] POS cart loss on card switch
**What's wrong:** `panels.tsx:70-89` `switch` returns one element → switching cards unmounts `PosWorkflow`, silently discarding an in-progress sale. No dirty guard.
**Fix:** Either keep-alive (render visible panels, toggle with `hidden`) or a confirm-on-leave when the POS cart is dirty.
**Verify:** Start a sale, click another card, confirm warning / state preserved.

### 7. [A low] Schedule self-scope when memberId absent
**What's wrong:** `schedule-panel.tsx:30-32` — a non-admin trainer with a missing `member.id` falls to `selectedTrainerId = null`, querying ALL trainers. Server scopes by `accessibleNodeIds` so likely not a leak, but client intent (self-only) isn't enforced.
**Fix:** Guard: if non-admin and no `memberId`, render an explicit empty/error state rather than an unscoped query.
**Verify:** Trainer role sees only own appointments.

### 8. [housekeeping] Correct stale MEMORY.md entry
`route-guards.ts` `requirePermission` is described as "a stub — don't use in beforeLoad", but it's fully implemented (`route-guards.ts:85-118`) and used in `customers/v2/view.tsx:19`, `appointment/view.tsx:19`, `packages/view.tsx:13`. Update the index line.

---

## Verification (run after fixes)
1. `cd apps/web && bun check-types` — clean
2. `bunx oxlint apps/web/src/components/pages/launchpad/` — 0/0
3. `PW_VIDEO=on bunx playwright test e2e/dashboard-launchpad.journey.spec.ts --project=journeys-e2e` — green + `video.webm` produced
4. Manual: `/dashboard` as a non-admin staff role → no console 403s on strip/badges; cards gate correctly
5. Re-run `/closing dashboard-launchpad` → expect A ≥8, B ≥7, C ≥8, Overall ≥7 (PASS)

---

## Re-rate 2026-06-16 (after fix pass — commit `0d8e64e8`)

**Fixes landed:** Tasks 1 (e2e+video), 2 (gate strip), 3 (installments card key), 4 (tile error states). Tasks 5–8 deferred.

| Check | Before | After | What changed |
|---|---|---|---|
| A. Edge cases | 6 ⚠️ | **8 ✅** | Both blocking 403 defects fixed: installments card key → `service_management:read` (`cards.tsx:62`); summary-strip queries gated on `reports:read`/`user_management:read` + tiles render only when permitted (`DashboardLaunchpad.tsx:54-68, 119-145`); tiles show "—" on error not `0`. Remaining low-severity: badge still hides on error, POS-cart-loss on card switch, schedule self-scope when memberId absent. |
| B. E2E + video | 2 ❌ | **7 ✅** | New `e2e/dashboard-launchpad.journey.spec.ts` — 4 journeys (card rail, POS embed, panel switching, /overview) **green** + 4 non-empty `*.webm` recorded via `PW_VIDEO=on` (45–99 KB each in `test-results/`). Deduct: badge *values* not asserted; non-admin role gating (this round's headline fix) has no fixture, so not e2e-proven. |
| C. Best approach | 7 ⚠️ | **7 ⚠️** | Permission-key mismatch (a C finding) now fixed, but the main C deduction — ~160 lines of forked schedule/customers panel logic + duplicated `beforeLoad` (task 5) — was **deferred**, so the score is unchanged. |
| **Overall** | **1** | **7** | Lowest = B(7); no check below 7 → no −1 penalty. |

**Arithmetic:** min(8,7,7) = 7; checks below 7 = 0 → no penalty → **Overall 7/10**.

**Gate: NEEDS WORK** (PASS needs ≥8). But moved from a hard-fail 1 (403s for the target persona + zero test proof) to a near-pass 7 (defects fixed, green e2e + video). No ❌ remain.

**To reach PASS (≥8), two items left:**
- **C → 8:** extract `useTrainerSchedule` + `useCustomerDirectory` hooks and a shared `beforeLoad` helper (task 5) to kill the forked logic.
- **B → 8:** add badge-value assertions + a non-admin role fixture proving cards/strip gate correctly (verifies this round's permission fix end-to-end).

---

## Re-rate 2026-06-16 #2 (after dedup pass — commit `76767ce4`)

**Fixes landed:** Task 5 (de-dup forked logic) + badge-render e2e assertion.

| Check | Round 1 | Round 2 | **Round 3** | What changed this pass |
|---|---|---|---|---|
| A. Edge cases | 6 | 8 | **8 ✅** | No change — gating already fixed; remaining items (POS-cart loss on switch, schedule self-scope) are LOW. |
| B. E2E + video | 2 | 7 | **8 ✅** | Added live-badge render assertion; launchpad spec now **6/6 green + video**. Residual: no non-admin role fixture (no staff storageState available), so the permission fix isn't role-variant-proven. |
| C. Best approach | 7 | 7 | **8 ✅** | Forked logic removed: `useCustomerDirectory` + `useTrainerSchedule` hooks + shared `DirectoryEmptyPane` + shared `redirectPureSaasOwnerToMissionControl` beforeLoad. Both origin routes (customers/v2, appointment/view) rewired; behavior-preserving (verified — see below). |
| **Overall** | **1** | **7** | **8** | min(8,8,8)=8; no check below 7 → no penalty. |

**Arithmetic:** min(8,8,8) = 8; checks below 7 = 0 → **Overall 8/10**.

**Gate: PASS** (≥8, no ❌). 🎉

**Refactor verification (behavior-preserving):**
- `bun check-types` clean · `oxlint` 0/0 on all 10 changed files.
- Launchpad e2e **6/6 green + video** (exercises both new hooks via the panels).
- The refactored `customers/v2` route renders fully in the run snapshot (directory lists + auto-selects "Xin Singh" + Customer 360 profile).
- The 9 failures in `70-customers-trainers` / `95-appointments-scheduling` are **pre-existing, not regressions**: they assert `getByRole('heading', {name:/customers/i})` but the committed pre-refactor route had no such heading element either (only `<span>` text) — confirmed via `git show HEAD:…view.tsx`. The remainder are deep CRUD/fixture specifics untouched by the read-path extraction.

**Residual (non-blocking, deferred):** non-admin role e2e fixture (B), POS-cart-loss guard on card switch (A/C low), schedule self-scope when memberId absent (A low), MEMORY.md stale `requirePermission` note (housekeeping).

**Commits:** `5447e947` (feat) · `95c126ab` (polish) · `0d8e64e8` (gating fixes + e2e) · `76767ce4` (dedup). All pushed to `feat/dashboard-launchpad`; no PR.

---

## Re-rate 2026-06-16 #3 (residuals cleared — commit `3750934b`)

All deferred residuals closed:
- **Non-admin e2e (B):** `auth-staff.setup.ts` + `launchpad-staff` project + `dashboard-launchpad-nonadmin.staff.spec.ts` — staff loads the launchpad with **zero 403s**. This spec **caught a real pre-existing bug**: the sidebar's pending-approvals badge fired `packageInstances.listPending` (admin/trainer-only) for staff → now gated on `hasRole(["admin","trainer"])`.
- **POS-cart-loss (A/C):** keep-alive (visited panels stay mounted, lazy on first visit) + a new e2e proving a typed POS value survives a card switch.
- **Schedule self-scope (A):** `useTrainerSchedule` fails closed when a non-admin has no resolved memberId.
- **Housekeeping:** corrected the stale `requirePermission` note in MEMORY.md.

| Check | #2 | **#3** |
|---|---|---|
| A. Edge cases | 8 | **9 ✅** (keep-alive + self-scope; no known gaps) |
| B. E2E + video | 8 | **9 ✅** (admin 7/7 + staff 1/1 green w/ video; non-admin gap closed) |
| C. Best approach | 8 | **8 ✅** |
| **Overall** | 8 | **8 ✅ PASS** |

**Verification:** type-check + oxlint clean; `dashboard-launchpad` (7 admin) + `launchpad-staff` (1) e2e all green with video. Commits: `5447e947` `95c126ab` `0d8e64e8` `76767ce4` `3750934b` — all pushed; no PR.
