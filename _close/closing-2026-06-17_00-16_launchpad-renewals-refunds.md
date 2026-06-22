# /closing — launchpad renewals + refunds/cancellations cards · Overall: 1/10

**Surface audited:** committed work `a0d4f590` on `feat/dashboard-launchpad` (4 files, +648/−86). The uncommitted working tree (`panels.tsx`, `add-customer-dialog.tsx`) is a separate concurrent NewCustomerPanel redesign — out of scope.

**What was done:** Added two daily-task cards to the dashboard launchpad. "Renewals / Expiring" (gated `service_management:read`) reuses the existing `MembershipsPage`; its badge counts memberships expiring within 7 days via `packageInstances.listExpiring`. "Refunds & Cancellations" (gated `refund_management:read`) is a **new ~557-line `RefundsPanel`** with a Refunds↔Cancellations toggle, status-filter tabs, and the full approve / reject (reason dialog) / process (method dialog) lifecycle; its badge counts pending refunds. Verified manually via browser-preview DOM assertions; `web:check-types` clean. No e2e spec or recorded video was added.

| Check | Score | Verdict | One-line |
|---|---|---|---|
| A. Edge cases | 8/10 | ✅ | Null-safe, permission-correct, double-submit-guarded, whitespace-validated; only a 30s stale-data double-action window (fails safe via server). |
| B. E2E + video | 2/10 | ❌ | Zero e2e and zero video for either new card; existing launchpad spec asserts the OLD six labels only; refunds tested on a different route via API. |
| C. Best approach | 5/10 | ⚠️ | Reinvents existing route-canonical `RefundsTab` + `CancelledSalesTab` + both dialogs, dropping partial-approve/bulk/audit/export/search/fraud-flagging. |

**Overall arithmetic:** lowest sub-score = 2; two checks (B=2, C=5) are below 7 → −1 → **Overall = 1/10.**

**Gate: NEEDS WORK** (B is ❌ — no e2e/video; C reinvents tested components). Under the skill's `--strict` reading this session should not be closed until B and the missing edge case are resolved.

---

## Fix plan (ordered by severity)

### 1. [lifts C 5→8, and B] Replace hand-rolled RefundsPanel internals with the existing route-canonical components
**What's wrong:** `RefundsPanel` re-implements UI that already exists and is the canonical surface — `apps/web/src/routes/.../refunds/view.tsx` redirects to the Sales view's refunds tab. The hand-rolled panel silently **drops** capabilities the real components have: partial approvals (`approveAmountCents`), bulk approve, audit trail, CSV export, search, and cancelled-sales fraud-row highlighting. Two parallel UIs over the same data will drift.
**Where:**
- `apps/web/src/components/pages/launchpad/refunds-panel.tsx:193-334` (refunds table) duplicates `apps/web/src/components/refunds/refunds-tab.tsx` (413 lines, same query/tabs/lifecycle/perms).
- `refunds-panel.tsx:335-405` (cancellations table) duplicates `apps/web/src/features/sales/components/CancelledSalesTab.tsx` (376 lines).
- `refunds-panel.tsx:408-554` hand-rolls reject + process dialogs that already exist as `apps/web/src/features/refunds/components/RejectDialog.tsx` and `apps/web/src/components/refunds/process-refund-dialog.tsx`.
**Concrete fix:** Collapse `RefundsPanel` to a ~40-line view-toggle that renders `<RefundsTab organizationId={…}/>` and `<CancelledSalesTab …/>` (pass `from`/`to`/handlers as the route does). Restores dropped features for free and removes ~500 lines.
**Verify:** `bun check-types` clean; open the Refunds card → confirm partial-approve, bulk, audit, export now present; confirm Cancellations fraud highlighting renders.

### 2. [lifts B 2→7] Add launchpad e2e coverage + video for BOTH new cards
**What's wrong:** `git show --stat a0d4f590 -- e2e/` is empty. `e2e/dashboard-launchpad.journey.spec.ts:37-44` asserts exactly the old six card labels (Renewals/Refunds absent) and the panel-swap test (`:75-118`) never clicks `renewals` or `refunds`. `e2e/dashboard-launchpad-nonadmin.staff.spec.ts:14-46` never asserts the new cards' gating. Refunds are only proven on the standalone `/dashboard/refunds/view` route via `orpcCall`, not the panel.
**Concrete fix:**
- Extend the admin label loop at `dashboard-launchpad.journey.spec.ts:37` to include "Renewals / Expiring" and "Refunds & Cancellations".
- Add panel-swap steps: click `refunds` card → assert RefundsPanel toggle + status tabs + approve/reject(reason)/process(method) dialogs; click `renewals` card → assert `MembershipsPage` mounts.
- In the staff spec, assert both cards are hidden without `service_management:read` / `refund_management:read`.
**Verify (record video):**
```
$env:PW_VIDEO="on"; bunx playwright test e2e/dashboard-launchpad.journey.spec.ts --project=journeys-e2e
$env:PW_VIDEO="on"; bunx playwright test e2e/dashboard-launchpad-nonadmin.staff.spec.ts --project=launchpad-staff
```
Video lands in `test-results/` (`playwright.config.ts:23`). *Note:* if Fix #1 is done first, the dialog assertions must target the reused `RefundsTab`/`CancelledSalesTab` markup, not the hand-rolled panel.

### 3. [lifts A 8→9, nice-to-have] Tighten the stale-data double-action window
**What's wrong:** Approve/Process buttons render from `refundsQuery.data` with `staleTime: 30_000` (`refunds-panel.tsx:113`). For up to 30s a client can fire `approveMutation` on a refund another operator already transitioned; the server rejects with BAD_REQUEST and toasts — fails safe, but the UX is a confusing error rather than a disabled control. (Moot if Fix #1 reuses `RefundsTab`, which may already handle this.)
**Where:** `refunds-panel.tsx:106-113`, action cell `:280-313`.
**Concrete fix:** lower `staleTime`, or `refetchOnWindowFocus`, or disable the row's actions when its status no longer matches the active filter after a refetch.
**Verify:** two-session manual test — approve in session A, confirm session B's button disables on next focus rather than erroring.

### 4. [nice-to-have] Add a "Cancelled" status filter tab
**What's wrong:** `RefundStatus` (`refunds-panel.tsx:25`) omits `cancelled`, but the server enum includes it and `"all"` returns cancelled rows. A user can't filter to cancelled-only refunds — a small functional gap vs backend capability. (Resolved automatically by Fix #1 if `RefundsTab` exposes it.)

---

## Verification (run after fixes)
```
bun check-types
bun check                                   # oxlint
$env:PW_VIDEO="on"; bunx playwright test e2e/dashboard-launchpad.journey.spec.ts --project=journeys-e2e
$env:PW_VIDEO="on"; bunx playwright test e2e/dashboard-launchpad-nonadmin.staff.spec.ts --project=launchpad-staff
```
Then re-run `/closing launchpad renewals refunds` to re-rate; target Overall ≥ 7 (B ≥ 7, C ≥ 8).

---

## Re-rate 2026-06-17 (after Fixes #1–#2 · commit ac9007be)

| Check | Before | After | Δ | Note |
|---|---|---|---|---|
| A. Edge cases | 8/10 | **9/10** ✅ | +1 | Now delegates to production-hardened RefundsTab/CancelledSalesTab; the 30s stale-data window (Fix #3) is resolved — RefundsTab refetches on approve (`refunds-tab.tsx:319-322,361-364`). Cancellations `sales:read` gate preserved (`refunds-panel.tsx`). |
| B. E2E + video | 2/10 | **8/10** ✅ | +6 | Both new cards now have e2e: rail-presence loop includes both labels; panel-swap tests for Renewals (memberships worklist) and Refunds (RefundsTab queue) incl. the Refunds→Cancellations toggle. **9/9 green with video** (`PW_VIDEO=on … --project=journeys-e2e`). Staff no-403 guard documented to cover the new listExpiring/refunds.list badge queries (2/2 green). Not 10: no in-launchpad approve/reject lifecycle click-through and staff gating proven via no-403 rather than explicit hide/show. |
| C. Best approach | 5/10 | **9/10** ✅ | +4 | Reinvention removed — RefundsPanel is now an ~85-line view toggle over the route-canonical components (−490 LOC). Partial-approve, bulk, audit, export, search, fraud highlighting restored. Renewals already reused MembershipsPage. |

**Overall arithmetic:** lowest = 8 (B); no two checks below 7 → no penalty → **Overall = 8/10** (was 1/10).

**Gate: PASS** (≥8, no ❌).

**Remaining (non-blocking, deferred):**
- Fix #3 (stale-data) — resolved by Fix #1; no separate action.
- Fix #4 (Cancelled-only filter tab) — RefundsTab has no Cancelled tab either; that's the canonical component's existing behavior, not a regression. Out of scope.
- B → 9+ would need an in-launchpad approve/reject lifecycle assertion and an explicit staff hide/show check; deferred as nice-to-have.
