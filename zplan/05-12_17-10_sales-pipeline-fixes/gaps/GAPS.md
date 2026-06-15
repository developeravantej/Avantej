# Swarm Audit — GAPS.md

**Session:** `05-12_17-10_sales-pipeline-fixes`
**Run at:** 2026-05-12T09:21:44Z
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 63 (10 critical · 21 high · 22 medium · 7 low · 3 info)

The plan is structurally sound but **has multiple build-blocking errors as written**. Do NOT begin /execute without resolving the P1 list. Most P1s are mechanical doc/schema corrections; one (P1-9) requires user product decision.

---

## P1 — Critical (block execution — fix before any /execute)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 1 | schema-drift, type-safety | `package_instance_status` and `installment_payment_method` are **plain `text` columns**, NOT Postgres enums. The `ALTER TYPE … ADD VALUE` SQL in plan §3 will throw `undefined_object` and the `EXCEPTION WHEN duplicate_object` handler won't catch it → migration bricks every tenant. | [package-instances.ts:58](packages/db/src/schema/tenant/package-instances.ts), [installments.ts:15](packages/db/src/schema/tenant/installments.ts) | Drop ALTER TYPE statements. New values are just text — no DDL needed. Update Drizzle column unions and Zod `statusSchema` enum instead. |
| 2 | schema-drift, doc | Migration filename `0010_sales_pipeline_fixes.sql` collides — slot 0010 is already taken (`0010_broad_ronan.sql`); current latest is `0050_add_is_recurring_idx.sql`. | `packages/db/src/migrations/tenant/` | Rename to `0051_sales_pipeline_fixes.sql`. |
| 3 | api-surface, type-safety | Permission `sales_management` does **not exist** in the `Resource` enum — only `sales` exists. Plan calls `sales_management` in 4 places (Phase 6 cancel button, plus implied callers). Every `requirePermission(..., "sales_management", ...)` will throw. | [permission.service.ts](packages/services/src/permission.service.ts) | Replace `sales_management` → `sales` everywhere in plan. |
| 4 | api-surface, type-safety | Plan invents permission `payout_management`. Existing resource is **`commission_payout`** (`payouts.ts:51`). Adding the duplicate widens the `Resource` union and breaks exhaustive consumers. | `permission.service.ts:53` | Reuse `commission_payout` for new payout procedures. Drop the invented resource + the seed-grant migration. |
| 5 | api-surface, type-safety | `statusSchema` Zod enum at `package-instances.ts:41-47` is closed. Phase 5 adds `frozen`/`completed` to data but leaves Zod gate untouched → list calls filtering on those statuses (the UI tabs Journey D ships) return BAD_REQUEST. | [package-instances.ts:41](packages/api/src/routers/package-instances.ts) | Add `"frozen"`, `"completed"` to `statusSchema` in same PR as Phase 5. |
| 6 | doc-consistency | Native paths are wrong throughout Phase 3 and Journey E. Repo uses Expo Router at `apps/native/app/(app)/dashboard/buy-package/...`, NOT `apps/native/src/screens/buy-package/...`. Symbol is `PLAN_CONFIG`, not `PLANS`. | `apps/native/app/(app)/dashboard/buy-package/plan.tsx`, `pay.tsx` | Rewrite Phase 3 paths and symbol names. `buy-package.context.tsx` does not exist either — use existing state mechanism (verify in actual screens). |
| 7 | doc-consistency, schema-drift | `packages/db/src/schema/tenant/packages.ts` does not exist. Phase 5 cites it for `frozenUntil` column. Real file is `package-instances.ts`. | — | Update Phase 5 task 5.1 path to `package-instances.ts`. |
| 8 | scalability | `ALTER TYPE ADD VALUE` and dependent DDL bundled in one migration; Postgres requires the new value to be visible BEFORE code uses it (and §6 acknowledges this risk but doesn't enforce it). After fix #1 the ALTER TYPE problem disappears, but the broader **two-deploy ordering** still applies to enum-like text-column changes that frontend Zod schemas read. | migration file | Split: `0051_schema_additions.sql` deploys with backend that tolerates old + new; `0052_data_writes.sql` and code using new values deploy after. |
| 9 | api-surface | `installmentPlans.list` requires `context.member` to exist. First-purchase native customers without a tenant `members` row → 403. Phase 3 silently fails for the very users it targets. | [installment-plans.ts](packages/api/src/routers/installment-plans.ts) | **Product decision required:** either (a) downgrade to a procedure that requires only a session + organizationId (not member); (b) ensure native creates a member row at signup before reaching plan picker; or (c) add a `publicCatalog` variant returning the same data. Add to Open Questions. |
| 10 | scalability | Backfill (1.6) reads "for each row" — implies row-by-row mutation across all tenants. At scale = N tenants × M splits, blocks for hours and risks per-row failures. | `apps/server/scripts/backfill-commission-rule.ts` (new) | Spec must say: chunked (`inArray`, 500/batch) UPDATE inside per-tenant tx, with explicit `--tenant <id>` filter for staged rollout, and a progress log every chunk. |

---

## P2 — High (fix before merging)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 11 | doc-consistency, type-safety | `runAppointmentCommission` actual signature is `(tx, id, updated, actor)` — 4 positional args. Plan implies an options bag `{ via: "completion" \| "cancellation" }`. Both call sites at `:638` and `:641` (not `:622` as plan says). | [appointment.service.ts](packages/services/src/appointment.service.ts) | Either change the signature (touches 2 call sites + signature) or pass `via` through `actor`/context. Plan must spell out the change explicitly. |
| 12 | schema-drift, type-safety | `service.requiresBooking` does NOT exist. Phase 1.5 (non-bookable POS items still earn at sale) hinges on this column. Closest existing: `schedulingType`, `sessionCount`, `type`. | services schema | **Product decision:** map `requiresBooking` to one of the existing columns OR add it. If add, include in 0051 migration. |
| 13 | schema-drift | `sessionsRemaining` column does not exist. Actual is `credits_remaining` (generated). Phase 4 list hydration uses wrong name. | `package-instances.ts` schema | Update Phase 4 spec to read `credits_remaining`. |
| 14 | type-safety, schema-drift | `frozen_until` column not in §3 SQL block (only mentioned in prose). Timezone unspecified — codebase convention is `{ withTimezone: true }`. | migration file | Add `ALTER TABLE package_instances ADD COLUMN IF NOT EXISTS frozen_until timestamptz;` and matching Drizzle. |
| 15 | type-safety, schema-drift | `commission_splits.earn_reason` column is in task 1.2 prose but missing from the §3 SQL block. | migration file | Add `ALTER TABLE commission_splits ADD COLUMN IF NOT EXISTS earn_reason text;` |
| 16 | type-safety, schema-drift | Open Q-2 Option B's `sales_order_items.commission_deferred` column is mentioned but never gets a migration entry or Drizzle definition. | migration file | Add column to migration AND Drizzle schema once Q-2 is decided. |
| 17 | doc-consistency | Phase 5 says "Phase 1 schema migration must merge first" but both write to the same migration file 0051 — meaningless dependency that contradicts §6's two-deploy plan. | plan §5 / §6 | Rephrase: "Phase 1 SQL changes must be in 0051; Phase 5 SQL changes go in 0052; deploy 0051 + Phase 1 backend → wait → deploy 0052 + Phase 5 backend." |
| 18 | scalability | `runBatch` `SELECT ... FOR UPDATE` with empty `staffIds` array collapses to "lock all approved splits". | `payouts.service.ts` (new) | Reject empty `staffIds`. Cap at 50 staff/batch. Lock only the rows being paid. |
| 19 | scalability | Concurrent appointment cancels → race on commission split insert. Existing partial unique index `commission_splits_appt_staff_unique` saves the data, but plan doesn't specify a `23505` catch → second concurrent cancel surfaces as 500. | `commission-calculator.service.ts` | Wrap insert in try/catch on PG `23505` → return existing row instead of throwing. |
| 20 | scalability | Open Q-2 Option B: `commission_deferred = true` rows have no sweeper, no partial index, no TTL. Unbounded growth of stuck rows. | plan Open Q-2 | Spec must include: `CREATE INDEX commission_deferred_idx ON sales_order_items(created_at) WHERE commission_deferred = true;` + cron sweeper that surfaces "deferred > 30d" to admin. |
| 21 | test-coverage | Phase 2 payouts (`previewBatch`/`runBatch`) — no service test, no integration test, no race-condition test. E2E exists at `e2e/batch3.dashboard.spec.ts:389` but asserts the *stub* page → false-green after rewrite. | tests | Add: `payouts.service.test.ts`, `payouts.integration.test.ts` (concurrent runBatch), update `batch3.dashboard.spec.ts:389` assertions. |
| 22 | test-coverage | Phase 1.6 backfill script — no testing convention exists for any `backfill-*.ts` script. Dry-run guard untested → mass-mutation risk if `--apply` flag-parsing slips. | script | Add `backfill-commission-rule.test.ts` covering dry-run vs apply; CI to assert script defaults to dry-run. |
| 23 | test-coverage | Phase 7.2 POS schedule consolidation — plan §6 calls for parity test BEFORE refactor; not listed in §1.8 or §7. Math drift risk. | tests | Promote the parity test into Phase 7 task 7.2 explicitly with 6 representative inputs. |
| 24 | test-coverage | Existing `pos-commission.test.ts` asserts the OPPOSITE of the new rule — must be inverted, not extended. | `apps/server/src/tests/pos-commission.test.ts` | Inversion task added to Phase 1 task 1.8. |
| 25 | test-coverage | `integration-setup.ts` lacks `makeIntegrationTrainerContext` — `commission-rule.integration.test.ts` and Phase 4 RBAC tests cannot be cleanly written without it. | `apps/server/src/tests/helpers/integration-setup.ts` | Add helper as a prerequisite task in Phase 1. |
| 26 | type-safety | All new procedures' inputs (`previewBatch`, `runBatch`, `cancel`, `freeze`, `extend`, `listAssignedToMe`) omit `organizationId: z.string().uuid()` — required by `orpcTenantMiddleware`. | router files (new) | Add `organizationId` field to every new procedure input schema. |
| 27 | type-safety | `via: "completion" \| "cancellation"` proposed inline with no shared type alias. `packages/types/src/` is essentially empty. | `packages/types/src/commission.ts` (new) | Export `CommissionEarnReason` union; reuse in service + router + UI badge. |
| 28 | type-safety | `salesOrderId` nullability mismatch risk: Drizzle defaults to NOT NULL while migration uses `IF NOT EXISTS` without explicit constraint. Existing rows in tenant DBs would violate NOT NULL on add. | migration | Use `ADD COLUMN IF NOT EXISTS sales_order_id uuid` (nullable) — backfill happens in code over time. |
| 29 | api-surface | `apps/native/.../buy-package.context.tsx` does not exist anywhere in the repo (covered also by P1-6). | native | Identify the actual state mechanism (Zustand store / route loader / context elsewhere) before Phase 3 starts. |
| 30 | api-surface | `salesOrders.cancel` exists but real input shape is richer than plan implies. | `packages/api/src/routers/sales-orders.ts` | Read the actual schema; update Phase 6.4 input mapping. |
| 31 | doc-consistency | `pay.tsx` needs math fixes (`/2` vs `/4`) at lines 354-360, not just label changes. Phase 7.7 understates scope. | native pay screen | Expand Phase 7.7 to "label + math correction once dynamic plans land". |

---

## P3 — Medium (fix before shipping)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 32 | api-surface | Native files live at `apps/native/app/(app)/dashboard/buy-package/...` not `apps/native/src/screens/`. (Same as P1-6, multiple touchpoints.) | — | Sweep plan for all `src/screens` references. |
| 33 | api-surface | `commission.liabilitySummary` is actually `commissionSplits.liabilitySummary`. Phase 2 KPI strip references the wrong router. | `apps/web/src/routes/.../payouts/view.tsx` (new) | Update reference. |
| 34 | api-surface | `memberships.freeze/cancel` already exists with different semantics (holds, not status flips). Adding `packageInstances.freeze/cancel` will be confusing. | `packages/api/src/routers/memberships.ts` | Audit existing memberships procedures; consider extending vs. duplicating. Document overlap in Phase 5 risks. |
| 35 | doc-consistency | `installment.service.ts` symbol is `getAdminInstallmentOverview`, not `adminOverview`. Phase 7.12 cites wrong name. | service | Rename references. |
| 36 | doc-consistency | "Cancel branch" / "completion branch" framing is misleading — both are `if`s inside one `update` transaction in `appointment.service.ts`. | plan §1, §6 | Reword to "the cancellation `if` block within `updateAppointmentStatus`". |
| 37 | doc-consistency | Phase 4.4 (`listPending` scope expansion) is a behaviour broadening, not a one-line tweak. Plan undersells it. | `package-instances.ts:903` | Expand task 4.4 with risk + RBAC test. |
| 38 | scalability | Pagination cursor keys not specified for payouts list. Default cursor pattern in this repo is by `(createdAt DESC, id DESC)`. | `payouts.service.ts` | Document cursor shape in plan. |
| 39 | scalability | Missing index `package_instances(assigned_trainer_id, status)` for `listAssignedToMe`. | migration | Add `CREATE INDEX IF NOT EXISTS package_instances_assigned_trainer_status_idx ON package_instances(assigned_trainer_id, status);` |
| 40 | scalability | Native `useQuery` lacks `staleTime`. | `apps/native/.../plan.tsx` | Set `staleTime: 60_000`. |
| 41 | scalability | Permission seed in Phase 2 must be pure idempotent SQL covering non-`admin` role names too. | migration | Use `INSERT … ON CONFLICT DO NOTHING` over a JOIN with all admin-equivalent roles. |
| 42 | test-coverage | Journey D (cancel package) — promised E2E but `e2e/` has zero matches for `package-instance|cancel.*package|freeze`. | new file | Create `e2e/package-instance-lifecycle.spec.ts`. |
| 43 | test-coverage | `makeCommissionSplit()` fixture stale — no `earnReason` / `source` columns; will silently mask the new column under `Partial<>` overrides. | `apps/server/src/tests/helpers/fixtures.ts` | Update fixture before writing new tests. |
| 44 | test-coverage | Phase 1.5 (non-bookable POS items still earn at sale) — branch coverage missing. | new test | Add to `pos.service.test.ts`. |
| 45 | test-coverage | Phase 1.7 conditional void in `sales-order.service.ts:268` — financial conditional with no test. | new test | Add to `sales-order.service.test.ts`. |
| 46 | test-coverage | Phase 4.4 RBAC broadening of `listPending` — security-adjacent, no permission-leak test. | new test | Add `listPending.rbac.test.ts`. |
| 47 | test-coverage | Phase 5 `markCompleteIfFinal` — dual call sites (installment-confirm + session-complete) untested. | new test | Both paths covered. |
| 48 | test-coverage | Coach-slot weightage trigger — plan says "verify with test" but doesn't name a file. | new test | `coach-slot-weightage.integration.test.ts`. (Note: trigger is moot if `commission_coach_slots` already has a check; verify before adding.) |
| 49 | test-coverage | `commission_payout` permission seed — no test that admin role gets it (silent-deploy risk). | new test | Add seed assertion. |
| 50 | type-safety | Enum addition: `package_instance_status` (text column) adding `frozen`, `completed`. Search for `PackageInstanceStatus` TS unions and exhaustive switches. | search | List all callers; update unions in same PR. |
| 51 | type-safety | `paymentMethod` enum extension `card | fpx | stripe` — exhaustive switches in commission/payment service. | search | List + update. |
| 52 | doc-consistency | Schema H-1: no FK on `assigned_trainer_id` exists today; before adding the FK, run an orphan-cleanup pre-flight. | migration prologue | `DELETE FROM package_instances WHERE assigned_trainer_id IS NOT NULL AND assigned_trainer_id NOT IN (SELECT id FROM members);` (or set NULL). |
| 53 | type-safety | `as any` count is currently 0 in pos/appointment/package-instances files; do not regress. | hygiene | Add lint check / PR review item. |

---

## P4 — Low / Info

- L1 (schema): proposed index names don't collide — INFO confirmed.
- L2 (api): no `baseRouter` registration changes needed (all 4 routers already registered).
- L3 (test): existing helpers cover admin context well — just need trainer extension.
- L4 (doc): Open Questions Q1–Q4 all confirmed genuinely open; no accidental resolutions.
- L5 (type): broader `as any` count is 30 across 6 files outside the change surface — not introduced by this plan.
- L6 (scalability): existing `commission_splits_staff_status_earned_idx (staffId, status, earnedAt)` already covers `runBatch`/`previewBatch` — no new index needed.
- L7 (scalability): `notifyStaffOfPendingPackage` runs OUTSIDE tx and is SQL-only — safe to extend.

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift | 3 | 2 | 3 | 1 | 1 | red |
| api-surface | 3 | 3 | 4 | 1 | 0 | red |
| test-coverage | 3 | 5 | 6 | 1 | 0 | red |
| doc-consistency | 3 | 3 | 6 | 1 | 0 | red |
| type-safety | 3 | 4 | 8 | 1 | 0 | red |
| scalability | 1 | 4 | 4 | 2 | 2 | amber |

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|---|---|---|---|
| P1 mechanical doc rewrites (#2, #3, #4, #6, #7) | plan.md only | 1,500 | sed-style substitutions, repeats across §3, §5, §6 |
| P1 schema rewrite (#1, #5, #8, #14, #15, #16) | plan.md + draft 0051 SQL | 2,000 | also requires Drizzle column union updates noted in plan |
| P1 product decisions (#9, #12) | plan.md Open Questions | 800 | only documentation; resolution comes from user |
| P1 spec elaboration (#10, #11) | plan.md tasks 1.6 + 1.1 | 1,200 | adds chunked algorithm + correct call signature |
| P2 procedure input fixes (#26, #27, #28, #29, #30) | plan.md §3 contracts table | 2,500 | adds `organizationId` and shared types |
| P2 test prerequisites (#21–#25) | plan.md §1.8 + §7 | 2,000 | new fixtures + integration helpers |
| P3 cleanup pass | plan.md scattered | 3,000 | name corrections, scope clarifications |
| **Total to ship a clean plan** | plan.md only | **~13,000** | one developer-hour to apply all P1+P2 |

---

## Auto-fixable findings

These are pure mechanical rewrites — safe for `--apply`. NO product decisions involved.

| # | Lens | Finding | Location | Mechanical fix |
|---|------|---------|----------|----------------|
| AF-1 | doc | Migration filename `0010_*` → `0051_*` | plan.md §3 + §5 | Replace literal `0010_sales_pipeline_fixes.sql` with `0051_sales_pipeline_fixes.sql` |
| AF-2 | api | Permission `sales_management` → `sales` | plan.md §3 contracts table + Phase 6 | Replace literal |
| AF-3 | api | Permission `payout_management` → `commission_payout` | plan.md §3 + Phase 2 | Replace literal; remove "add to Resource enum" task |
| AF-4 | doc | Schema file `packages/db/src/schema/tenant/packages.ts` → `package-instances.ts` | plan.md Phase 5 | Replace literal |
| AF-5 | doc | Native paths `apps/native/src/screens/buy-package/` → `apps/native/app/(app)/dashboard/buy-package/` | plan.md §3, §4, Phase 3, Phase 7.7 | Replace literal |
| AF-6 | doc | Native symbol `PLANS` → `PLAN_CONFIG` | plan.md Phase 3 task 3.2 | Replace literal |
| AF-7 | doc | Service symbol `adminOverview` → `getAdminInstallmentOverview` | plan.md Phase 7.12 | Replace literal |
| AF-8 | doc | Column name `sessionsRemaining` → `credits_remaining` | plan.md Phase 4 task 4.1 | Replace literal |
| AF-9 | api | Router reference `commission.liabilitySummary` → `commissionSplits.liabilitySummary` | plan.md Phase 2 task 2.2 | Replace literal |
| AF-10 | doc | Line numbers in §6 `appointment.service.ts:622` → `:638, :641` | plan.md §6 + Phase 1 | Replace literal |
| AF-11 | schema | Drop `ALTER TYPE` blocks from §3 SQL (text columns, not enums) | plan.md §3 | Remove the two `DO $$ BEGIN ALTER TYPE … EXCEPTION` blocks |
| AF-12 | schema | Add missing column DDL to §3 SQL: `earn_reason`, `frozen_until`, `commission_deferred` | plan.md §3 | Insert 3 `ALTER TABLE … ADD COLUMN IF NOT EXISTS` lines |
| AF-13 | schema | Add `package_instances(assigned_trainer_id, status)` index | plan.md §3 | Insert one `CREATE INDEX IF NOT EXISTS` line |

**Manual judgment required (not auto-fixable):**
- P1-9 (`installmentPlans.list` access for first-purchase native customers) — needs product decision.
- P1-12 (`service.requiresBooking` mapping) — needs product decision.
- P1-8 (split into 0051 + 0052 migrations) — needs sequencing judgment.
- P2-11 (`runAppointmentCommission` signature change vs. context-pass) — needs implementation judgment.
- All test-coverage P2 items — require new test files, not mechanical.
- P2-31 (`pay.tsx` math correction) — needs reading the actual file to compute correct multipliers.
