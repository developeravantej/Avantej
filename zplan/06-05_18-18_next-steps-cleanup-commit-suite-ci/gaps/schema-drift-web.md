# Schema Drift Audit
**Session:** 06-05_18-18_next-steps-cleanup-commit-suite-ci
**Findings:** 5 (0 critical · 0 high · 0 medium · 0 low · 5 info)

> NOTE: `gaps/schema-drift.md` already existed and holds a *different* audit (the `06-05_18-33_server-holding-it-back` server test-refactor plan). To avoid clobbering it, this web-plan audit (`web-holding-it-back-plan.md`) is written to `schema-drift-web.md`. Reconcile/rename as needed.

## Findings

### [INFO] No DB schema/migration changes implied by any task
**Plan claims:** "Do not touch backend/services/schema" (Risk notes, line 82); plan is purely component extraction, type cleanup, a11y.
**Actual:** Every task (Phases 0–4) edits only `apps/web/src/**` route/component files, plus at most a *type stub* in `packages/api/src/routers/_types/server-router-types.ts` (T1.1b) — a `.d.ts`-level declaration, not a Drizzle schema, not a table/column/enum/FK. No `packages/db/src/schema/**` or `packages/db/src/migrations/tenant/**` file is in scope. Confirmed: plan touches no DB schema.
**File:** zplan/06-05_18-18_next-steps-cleanup-commit-suite-ci/plan/web-holding-it-back-plan.md:82
**Fix:** None. Claim verified.
---

### [INFO] `createdByName` (sales order, $id.tsx:476) — server-computed, not a column
**Plan claims:** Remove `order as { createdByName?: … }` cast once field is on the order type (T1.2).
**Actual:** `createdByName` is NOT a column on the `sales_orders` schema. It is computed in the router: `packages/api/src/routers/sales-orders.ts:124-139` builds `let createdByName` via a control-panel `user.name ?? user.email ?? null` lookup and returns `{ ...order, createdByName }`. It is a typed property of the procedure return shape, so dropping the cast is safe IF the dist type reflects it. The `?? fallback` in the route remains load-bearing because the server value can legitimately be `null`. Plan already instructs keeping the runtime fallback (line 42) — correct.
**File:** packages/api/src/routers/sales-orders.ts:124,139
**Fix:** None. Keep `?? fallback`; remove only the cast. No schema work.
---

### [INFO] `branchId` (sales order, $id.tsx:621) — real column, exists in schema
**Plan claims:** Remove `order as { branchId?: … }` cast once `branchId` is on the order type (T1.2).
**Actual:** `branchId` IS a real `uuid("branch_id")` column on the sales-orders schema (`packages/db/src/schema/tenant/sales-orders.ts:44`, indexed at :99). It flows through the order query natively. Safe to drop the cast; the field genuinely exists. This is the one field of the four that is a true column, not computed.
**File:** packages/db/src/schema/tenant/sales-orders.ts:44
**Fix:** None. Cast removal is straightforward; no schema work.
---

### [INFO] `connectedCount` / `totalTrainerCount` (google-calendar.tsx:134) — server-aggregated, not columns
**Plan claims:** Remove `orgStatusRaw as any` cast; rely on typed query data (T1.2).
**Actual:** Neither field is a schema column. `googleCalendar.orgStatus` computes them at `packages/api/src/routers/google-calendar.ts:142-143` as `connectedCount: Number(connectedCountRow)` and `totalTrainerCount: Number(trainerCountRow)` from COUNT aggregates. They are typed properties of the procedure's return object. Dropping the `as any` is safe provided the dist type is current (T1.1b rebuild caveat applies). No schema dependency.
**File:** packages/api/src/routers/google-calendar.ts:142
**Fix:** None. Type-stub/dist concern only, not schema.
---

### [INFO] `amountCents` / `createdByName` (commissionSplits.listPendingReview, review-tab.tsx:425) — remapped/looked-up, not columns
**Plan claims:** Type `r` as the inferred element of `listPendingReview().rows`; keep field-remap fallbacks (T1.2).
**Actual:** Confirmed both are NON-column derived fields on `PendingReviewRow` (`packages/services/src/commission-splits.service.ts:2843,2849`). The DB column is `calculated_amount` — the service remaps `amountCents: r.calculatedAmount` (:2957). There is NO `amount_cents` column on `commission_splits`. `createdByName` is a control-panel `user.name` lookup with a `"(unknown)"` fallback (:2963-2965). The interface `PendingReviewRow` (:2839-2854) is fully typed and exported, so `Awaited<ReturnType<typeof listPendingReview>>["rows"][number]` is the correct replacement for `(r: any)`. The plan's instruction to KEEP the field-remap fallbacks is load-bearing because `createdByName` can be `"(unknown)"` server-side. No schema change.
**File:** packages/services/src/commission-splits.service.ts:2843,2849,2957
**Fix:** None. Use the exported `PendingReviewRow`/`ReturnType` for the row type; no schema work.
---

## Summary
This is a frontend-only refactor (component extraction, `as any` removal, `useMutation`→`useApiMutation`, a11y) and the schema-drift audit confirms it touches zero DB schema, migrations, tables, columns, enums, or FKs. No migration numbers are cited (correct — none needed). Of the four cast-target field groups in Phase 1, three (`createdByName` on sales order, `connectedCount`/`totalTrainerCount`, and `amountCents`/`createdByName` on commission rows) are server-computed or remapped — not bare schema columns — so the plan's directive to remove only the *cast* while preserving the `?? fallback` runtime chains is correct and load-bearing (notably `amountCents` is a remap of the `calculated_amount` column, and there is no `amount_cents` column to "expose"). The fourth, `branchId`, is a genuine `branch_id` column and is straightforward. No HIGH/CRITICAL drift exists; the only non-schema risk is the documented stale-dist-type rebuild caveat (`cd packages/api && bun run build`), which the plan already calls out.
