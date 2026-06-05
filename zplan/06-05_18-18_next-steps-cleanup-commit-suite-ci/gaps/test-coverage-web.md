# Test-Coverage Audit — `web-holding-it-back-plan.md`

**Auditor:** test-coverage
**Date:** 2026-06-06
**Plan:** `zplan/06-05_18-18_next-steps-cleanup-commit-suite-ci/plan/web-holding-it-back-plan.md`
**Scope:** Behavior-preserving frontend refactor (component extraction, `as any` removal, `useMutation`→`useApiMutation`, a11y, remove `use client`). Verification gate is `bun check-types` + oxlint + manual Chrome MCP. Adds **no new unit tests.**

> Note: `gaps/test-coverage.md` in this folder audits a DIFFERENT plan (server-holding-it-back). This file is the web-plan audit.

**Severity counts:** CRITICAL 0 · HIGH 1 · MEDIUM 3 · LOW 2 · INFO 2

**Bottom line:** As expected for a refactor, the plan relies almost entirely on `bun check-types` + manual Chrome verification. There IS partial e2e smoke coverage (`batch3`/`batch5` dashboard specs confirm the affected pages still load and dialogs still open), which catches catastrophic breakage from extraction — but there is **zero component-level (RTL) coverage** of the five refactored components, and crucially **no assertion on the commission review-tab `amountCents → calculatedAmount` field mapping** (the Phase 1 `as any` removal target). A silent wrong-field rename there is the one HIGH gap.

---

## Findings

### [HIGH] Phase 1 `as any` removal on `review-tab.tsx:425` has no test guarding the `amountCents → calculatedAmount` field remap

Plan T1.2 removes the `(r: any)` cast at `review-tab.tsx:425`, types `r` as the inferred service row element, and explicitly **keeps the runtime `?? fallback` chains**. The mapping is:

```ts
calculatedAmount: r.amountCents ?? r.calculatedAmount ?? 0,
createdBy:        r.createdByName ?? r.createdBy ?? null,
notes:            r.note ?? r.notes ?? null,
```

Once `r` is strongly typed, TS will flag the non-existent branch of each `??` (e.g. if the service row only has `amountCents`, `r.calculatedAmount` becomes an error). The natural fix under type pressure is to drop a branch — and if the wrong branch is dropped, the commission amount silently renders as `0` (RM 0.00) or a wrong value. This is financial display in the commissions review approve/reject flow — the user-visible-and-silent class the prompt flags as HIGH.

**Existing coverage — none that catches this:**
- **No RTL/unit test renders `review-tab.tsx`** (grep `review-tab|ReviewTab` in `apps/web/src/__tests__/` → nothing).
- e2e `commissions-review-role-grouping.journey.spec.ts` drives the Review tab but asserts only **`roleType` grouping** and "table or empty state renders" — never a row's monetary amount.
- e2e `gap-prove-commission.spec.ts` references `calculatedAmount` only on an **API-boundary `LedgerRow`** read, not the review-tab UI mapping.
- e2e `gap-prove.spec.ts` (`F-CP-002`) only asserts `resolveReview` returns FORBIDDEN when the permission isn't seeded.

A wrong field rename passes `bun check-types`, passes every e2e, and surfaces only if manual Chrome inspection happens to look at the amount column with seeded data.

**Recommendation:** Before the Phase 1 edit, add a ~20-line RTL test that renders `review-tab` with a mocked `listPendingReview` returning `amountCents: 12345` and asserts displayed `RM 123.45`. Reuse the existing `mock-client`/`render-with-providers` harness. Highest-value test for this plan.

---

### [MEDIUM] No component-level test on any of the five extracted components — extraction relies entirely on type-check + manual

Phase 3 extracts `PlanCard`, `PlanFormDialog`, `DeactivatePlanDialog` (from `settings/installment-plans.tsx`) and `CancelSaleDialog`, `StatusHistoryCard`, `SalesStatusBadge` + `mapReceipt` (from `sales/$id.tsx`). The real refactor risk is silent output / query-key change.

- **No RTL test renders any of these.** The two similarly-named existing tests target **different pages**:
  - `__tests__/pages/packages/installments-page.test.tsx` → `@/components/pages/packages/installments-page` (package-instances installments view), **NOT** `settings/installment-plans.tsx` with `PlanCard`.
  - `__tests__/pages/sales-view.test.tsx` → `sales/view` (the **list** page), **NOT** `sales/$id.tsx` detail with `CancelSaleDialog`/status badge.
- `mapReceipt` is extracted as a pure fn (`map-receipt.ts`) — an ideal unit-test target — but no test exists or is planned.

The plan is 100% reliant on `bun check-types` (catches signature mismatches) + manual Chrome (catches gross visual breakage). Neither catches a silently-dropped `invalidateQueries` key or a subtly-altered JSX value.

**Recommendation:** At minimum add a unit test for the extracted pure `mapReceipt` fn. MEDIUM not HIGH because Phase 3 is mechanical, type-check catches prop/signature drift, and the smoke specs below catch crashes.

---

### [MEDIUM] e2e smoke coverage exists but only asserts "loads / no crash / dialog opens" — won't catch silent display regressions

Credit where due — relevant e2e smoke coverage exists:
- `batch5.dashboard.spec.ts` — `Settings — Installment Plans`: page loads, heading visible, no JS crash, "New Plan" button visible, clicking it **opens a dialog with form fields**. Also covers `Settings — Google Calendar` (a Phase 1 `as any` target): loads, no crash, connect/connected status shows.
- `batch3.dashboard.spec.ts` — `Sales Detail (/dashboard/sales/$id)`: navigates list→detail, asserts back-link visible, bogus UUID doesn't crash.
- `sales-cancellation-list.journey.spec.ts` — cancelled-sales tab renders table or empty state.

These catch catastrophic failure (extraction throws / white-screen). They do **not** assert: installment plan card amounts/months, sales status badge label/color, the cancel dialog actually firing the cancel mutation, or `StatusHistoryCard` contents. A behavior-preserving extraction that silently mangles a displayed value passes all of these.

**Recommendation:** State in the verification gate that e2e smoke ≠ behavior preservation; the manual Chrome step must eyeball amount/status values, not just "page renders." Optionally extend `batch5` installment-plans + `batch3` sales-detail with one value assertion each.

---

### [MEDIUM] Phase 2 `useMutation`→`useApiMutation` toast/invalidation behavior is not asserted at the call sites

T2.1 (`review-tab.tsx:452` resolveReview) and T2.2 (`sales/$id.tsx:180` cancelSale) convert raw `useMutation` to `useApiMutation`, changing how toasts fire and which query keys invalidate. The **hook itself** is covered (`__tests__/hooks/useApiMutation.test.tsx`), so the generic toast+invalidate contract is tested. But there is **no test asserting the converted call sites** pass the right `invalidate: [...]` keys / `successMessage`. The plan itself flags this risk. A dropped invalidate key (e.g. `listLedger.key()` / `listPendingReview.key()`) means stale data after approve/reject/cancel — visible but easy to miss manually.

**Recommendation:** Lean on the existing hook test for the mechanism; for the call sites, the manual Chrome step should verify the row disappears / list refreshes after approve and after cancel (invalidation actually fired). MEDIUM because stale-data-after-mutation is user-visible; not worth a new RTL test.

---

### [LOW] `set-password.tsx` (finding #4) correctly marked "no work" — no test needed

Plan T0.2 closes this with no edit. Nothing to cover.

---

### [LOW] Phase 0 `use client` removal + Phase 4 a11y — no automated coverage warranted

Removing `"use client"` from `commissions/view.tsx:1` is a Vite no-op (directive ignored by the bundler); `bun check-types` + the existing `batch5` commissions smoke load suffices. Phase 4 `aria-label` additions have no a11y assertion test (no axe/jest-axe in the suite), but adding labels is additive and low-risk. No test recommended.

---

### [INFO] RTL harness is mature and ready if any test is added

`__tests__/helpers/render-with-providers.tsx` (QueryClient wrapper) + `__tests__/helpers/mock-client.ts` (mocks `@/utils/orpc` — NOT `@/lib/client`). Any recommended test reuses this in ~15–20 lines. `useApiMutation` already has dedicated coverage.

### [INFO] e2e is module-grouped; no journey drives review approve/reject or sales/$id cancel with value asserts

Smoke lives in `batchN.dashboard.spec.ts` (page-load/no-crash); behavioral flows in `*.journey.spec.ts`. All affected pages have at least smoke coverage. No journey spec drives the review-tab approve/reject mutation or the sales/$id cancel dialog end-to-end with value assertions.

---

## Summary

| # | Finding | Severity |
|---|---------|----------|
| 1 | `review-tab.tsx:425` `amountCents→calculatedAmount` remap untested; wrong rename silently renders RM 0.00 | **HIGH** |
| 2 | No component-level (RTL) test on any of the 5 extracted components; `mapReceipt` pure fn untested | MEDIUM |
| 3 | e2e smoke (`batch3`/`batch5`) only asserts loads/no-crash/dialog-opens — misses silent display regressions | MEDIUM |
| 4 | Phase 2 `useApiMutation`: hook tested, call-site invalidate keys not | MEDIUM |
| 5 | `set-password.tsx` correctly no-work; no coverage needed | LOW |
| 6 | `use client` removal + a11y labels — no automated coverage warranted | LOW |
| 7 | RTL harness ready (`render-with-providers` + `mock-client` on `@/utils/orpc`) | INFO |
| 8 | e2e module-grouped; no journey drives review approve/reject or sales/$id cancel with value asserts | INFO |

**Single highest-value action:** Add one RTL test for `review-tab` asserting `amountCents: 12345` → `RM 123.45` before the Phase 1 cast removal. Everything else is acceptably covered by `bun check-types` + existing e2e smoke + the planned manual Chrome pass — provided the manual pass explicitly checks **displayed amounts and status values**, not just "page renders."

**Trap to avoid:** `installments-page.test.tsx` and `sales-view.test.tsx` look like they'd cover the refactor but do not — they target the package-instances installments view and the sales *list* page, not `settings/installment-plans.tsx` or `sales/$id.tsx`. Do not mistake their green status for coverage of the extracted components.
