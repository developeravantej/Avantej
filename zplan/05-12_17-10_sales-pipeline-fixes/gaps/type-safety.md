# Type-Safety Audit — `sales-pipeline-fixes`

Plan reviewed: `zplan/05-12_17-10_sales-pipeline-fixes/plan/plan.md`
Auditor lens: anything that would either fail `bun check-types`, hide a financial/auth bug behind a cast, or break exhaustiveness checks.

Severity legend: **CRITICAL** (build/migration breaks), **HIGH** (financial/auth unsafety), **MEDIUM** (missing guard / silent narrowing loss), **LOW**, **INFO**.

---

## CRITICAL

### C1. `package_instance_status` and `installment_payment_method` are NOT Postgres ENUM types — `ALTER TYPE … ADD VALUE` will throw
File evidence:
- `packages/db/src/schema/tenant/package-instances.ts:58` → `status: text("status").notNull(), // "pending" | "active" | "expired" | "exhausted" | "cancelled"` — plain `text`.
- `packages/db/src/schema/tenant/installments.ts:15` → `paymentMethod: text("payment_method")` — plain `text`.
- The only real `pgEnum` usages in tenant schema are `purchase_order_status` and `promotion_type` (`packages/db/src/schema/tenant/promotions.ts`, `purchase-orders.ts`). No enum named `package_instance_status` or `installment_payment_method` exists.

Plan §3 migration block lines 132-186 issues two `ALTER TYPE … ADD VALUE` statements for both — both will raise `ERROR: type "package_instance_status" does not exist` on first run, blocking every tenant migration thereafter. The wrapping `DO $$ … EXCEPTION WHEN duplicate_object …` only catches `duplicate_object`, not `undefined_object`, so the failure will not be swallowed.

Required fix:
- For `package_instance_status`: nothing to ALTER. Just expand the Drizzle code-side comment + any zod enums (`statusSchema` in `packages/api/src/routers/package-instances.ts:41`) to include `"frozen" | "completed"`. Add a CHECK constraint if you want DB-side enforcement, or convert column to a `pgEnum` in a separate, multi-step migration (CREATE TYPE → backfill → ALTER COLUMN ... USING).
- For `installment_payment_method`: same — extend the inline literal-set, no DDL.

Also: even if these *were* real enums, `ALTER TYPE … ADD VALUE` cannot run inside the same transaction as a query that uses the new value (Postgres restriction). The plan calls this out at §6 risks line 613 but then keeps the bad SQL anyway.

### C2. `statusSchema` in `package-instances.ts:41-47` will reject `"frozen"` and `"completed"` after Phase 5
The router validates list/filter input with a closed `z.enum([...])`. After Phase 5 adds `frozen`/`completed` instances, every list call that filters on those statuses (e.g. the existing UI tabs the plan promises to honor — Journey D, success criterion 6) will throw `BAD_REQUEST` *before* the handler runs. The plan never mentions widening this enum. Three call-sites in the same file (lines 62, 239, 500) inherit the bug.

Required fix: extend `statusSchema` to include the two new values when 5.1 lands, in the same PR as the schema change.

### C3. Plan invents permission name `payout_management` that does not exist
Plan §3 contract table (line 195) and §2.5 (line 363) say "Add `payout_management` to `Resource` enum if not present". The existing enum at `packages/services/src/permission.service.ts:53` is **`commission_payout`**, and that is what the live router uses (`packages/api/src/routers/payouts.ts:51`). Adding a second resource will either:
- (a) silently double-grant by leaving `commission_payout` orphaned, or
- (b) widen the `Resource` union and break every exhaustive consumer of it.

Either way it's a type-vs-runtime drift bomb. Use the existing `commission_payout` resource; delete task 2.5 from the plan.

---

## HIGH

### H1. Plan procedure inputs miss the established `organizationId: z.string().uuid()` requirement
Every existing oRPC procedure in `payouts.ts`, `installment-plans.ts`, and `package-instances.ts` requires `organizationId` in the input shape (see e.g. `payouts.ts:25-32`, `installment-plans.ts:18-22`). The plan's §3 contract table (lines 192-203) lists inputs like `{ staffIds, periodStart, periodEnd }` and `{ id, reason }` without it. If the new procedures are written verbatim from the plan they will:
- pass type-check (oRPC accepts any zod object), and
- fail at request time inside `orpcTenantMiddleware`, which extracts `organizationId` from the body to set up `tenantDb`.

Concretely the cancel/freeze/extend/runBatch/previewBatch procedures all need `organizationId: z.string().uuid()` added. Plan should be updated so implementers don't omit it.

### H2. `via: "completion" | "cancellation"` is a brand-new string union with no shared definition
Plan introduces this discriminator in two places (1.1, 1.3) and persists it as `commission_splits.earnReason` (text). No type alias proposed. Risk: every caller types it inline; a typo (`"cancellation"` vs `"cancelled"` — both are already in this codebase for adjacent concepts) compiles fine but breaks the audit/UI badge. The frontend at `commissions/my.tsx`/`view.tsx` (audit §6) reads the value as a free-form string.

Recommend: add `export type CommissionEarnReason = "completion" | "cancellation"` in `packages/services/src/commission-calculator.service.ts` (or `packages/types/src/index.ts` — currently only re-exports `better-auth`) and use it in both the function signature and the column reader. Without this, Phase 1 will accumulate stringly-typed call sites that are unsafe to extend later (e.g. when Open Q-3 / sale-cancel reason is added).

### H3. Drizzle column types — `frozenUntil` timezone unspecified
Plan §3 contract table mentions `frozenUntil` (line 199) but the migration block in §3 does NOT include the SQL for it; only Phase 5 §5.1 alludes to it. Codebase convention is unambiguous: every newer timestamp uses `{ withTimezone: true }` (see `commission-splits.ts:71,75,100`, `installments.ts:13,14,19,20`, `package-instances.ts:79-83`). The older columns on `package_instances` itself (`startsAt`, `expiresAt`, lines 54-55) are *not* tz-aware — that is pre-existing tech debt.

Required fix: when adding `frozen_until`, use `timestamp("frozen_until", { withTimezone: true })`. Migration must also include the `ADD COLUMN` statement, which is currently missing from the §3 SQL block. (`schema-drift.md` already flags the missing migration entry; this audit confirms the *type* contract.)

### H4. `salesOrderId` already exists on `commission_splits` — plan suggests adding it to `installments`/`package_instances` but doesn't reconcile types
`commission_splits.salesOrderId` already exists (`commission-splits.ts:44`). Plan §3 migration adds `installments.sales_order_id` and `package_instances.sales_order_id` as `uuid REFERENCES sales_orders(id)` — fine. But task 7.3 says "Add `salesOrderId` to installment + package_instance writes" without specifying nullability behaviour for legacy rows. Both columns must be `NOT NULL DEFAULT … impossible` or stay nullable; plan doesn't say. If Drizzle gets `salesOrderId: uuid("sales_order_id").notNull()` while migration uses `IF NOT EXISTS … (no NOT NULL)`, schema-drift CI will fail.

Recommend: declare nullable in Drizzle (`uuid("sales_order_id")` without `.notNull()`) to match the additive migration; document that legacy rows stay null.

---

## MEDIUM

### M1. Exhaustive switches on package-instance status — none currently exist
Searched all `apps/web/src` for `case "frozen"` / status switch patterns: zero matches in `components/pages/packages/`. The status field is consumed via badges and equality checks, not exhaustive `switch` blocks, so adding `frozen`/`completed` won't break TS — but it WILL silently fall through default UI (no badge color, no label). Worth flagging in plan: every `getStatusBadge`-style helper across `apps/web/src/components/pages/packages/memberships-page.tsx`, `instances-page.tsx`, plus `customers/v2/packages-tab.tsx`, `customer-360/package-row.tsx`, `customer-detail-sheet.tsx`, `customer-profile-panel.tsx` needs the two new cases or default rendering verified.

### M2. `installmentPlans.list({ activeOnly: true })` from native won't work as written
Plan §3.1 says the procedure is `protectedProcedure` and "leave as-is". True — but the input schema at `installment-plans.ts:17-22` REQUIRES `organizationId`. The plan's quoted call (line 114) is `orpc.installmentPlans.list({ activeOnly: true })` — missing `organizationId`. This will fail Zod validation at runtime AND fail TS at compile time once the oRPC client type narrows. Every call site needs `organizationId`. Fix the plan snippet so implementers don't paste the broken call.

Additionally: clients can read this procedure (`role !== "client"` branch is skipped, line 38) — good. Plan §3.1 worry about auth is not real.

### M3. `commission_deferred boolean` (Open Q-2 default) — no Drizzle column proposed
Plan picks Option B in Open Q-2 (line 680): "set `sales_order_items.commission_deferred = true`". The migration block in §3 does NOT add this column. Phase 1.4 (line 292) references it as if it exists. Without Drizzle definition + migration + null guard on every existing reader of `sales_order_items`, type-check will pass (Drizzle won't see the column) but the runtime write will silently set a non-existent field (Postgres will throw on INSERT/UPDATE).

Required fix: add `commissionDeferred: boolean("commission_deferred").default(false).notNull()` to `sales-order-items.ts` schema + `ADD COLUMN IF NOT EXISTS commission_deferred boolean NOT NULL DEFAULT false` to migration 0010.

### M4. `assignedTrainerId` already nullable — but new readers need null guards
`package-instances.ts:63` declares `assignedTrainerId: uuid("assigned_trainer_id")` (nullable). Phase 4's `listAssignedToMe` filters with `WHERE assignedTrainerId = context.member.id` — safe. But Phase 4.2 drawer + Phase 5 cancel/freeze handlers should not assume non-null when displaying trainer name; existing helper `hydrateClientNames` is fine but no equivalent for trainer. Confirm or add `hydrateTrainerNames` with explicit `null` handling. Plan doesn't mention it.

### M5. `paymentMethod` extension — coverage gaps in service code
Plan §3 migration adds `card | fpx | stripe` to (the non-existent enum, see C1) `installment_payment_method`. Even after fixing C1, downstream service code in `packages/services/src/installment.service.ts` and `packages/services/src/pos.service.ts` reference `paymentMethod` as untyped strings (search confirms 32 files touch the symbol; none use a discriminated union). No exhaustive switch will break, but business logic that compares `paymentMethod === "manual_transfer"` will treat the new values as "other" — UI dropdown (task 7.11) needs explicit handling. Flag for Phase 7.11 owner.

### M6. `freeze` proc input `until?` — type unspecified
Plan contract table line 199: `{ id, until?, reason }`. `until` is presumably an ISO date or `Date`. Convention in this codebase: oRPC inputs use `z.string().datetime()` or `z.coerce.date()`. Without specifying, two implementers will pick differently. Recommend `until: z.string().datetime().optional()` to match the cookie/timestamp pattern used in payouts router filters.

### M7. `addDays: number` — no bounds
`extend` proc input. Existing convention for numeric ranges (e.g. `installment-plans.ts:158`: `pricePremiumBps: z.number().int().min(0).max(10000)`) is to bound. Unbounded `z.number()` allows negative or fractional days, which would silently corrupt `expiresAt`. Recommend `z.number().int().min(1).max(365)`.

### M8. `staffIds: string[]` — no UUID validation
`previewBatch` / `runBatch` inputs. Convention: `z.string().uuid()` on every id field (see `payouts.ts:69` `recipientId: z.string()` is itself a small drift, but installment-plans/package-instances use `.uuid()`). For a financial batch operation, recommend `z.array(z.string().uuid()).min(1).max(500)` to match the §7 perf-checklist payload cap.

---

## LOW

### L1. `?? ""` fallback removal (task 7.5) — stronger types needed
Plan says "throw if missing". Better: tighten the upstream type so `callerUserId` is `string` not `string | undefined`, then the fallback is a TS error. Rip the contract back to the source instead of guarding at every call site.

### L2. `via` discriminator not propagated to audit row payload type
`writeAudit` is called from `package-instances.ts` and `appointment.service.ts`. Audit payload is typically `Record<string, unknown>` or `jsonb`. Adding `via` here is type-safe today, but if `AuditPayload` is later tightened, the new field will be silently dropped. Add a typed audit payload alias for cancellation events.

### L3. `cancelled` vs `confirmed` literal in sales KPI (task 6.1)
Plan changes UI from `'completed'` to `'confirmed'`. No type narrows the `status` field today (Drizzle stores it as `text`). Recommend a shared `SalesOrderStatus` union exported from `packages/types/src/index.ts` (currently only Better-Auth re-exports) so both writer (`pos.service.ts:376`) and reader (`sales/view.tsx:96`) reference the same literal set.

### L4. `non-null !` assertion accumulation
Grep across `packages` shows zero `as any` / `@ts-ignore` in `pos.service.ts`, `appointment.service.ts`, `package-instances.ts` router today (clean). `as any` count for the broader package: 30 occurrences across 6 files (mostly `households.ts`, `hierarchy.ts`, `installment.service.ts`, `lib/pg-error.ts`). Phase 1 + 5 modify `installment.service.ts` indirectly via 7.x — keep the `as any` count from rising. Suggest plan adds a "no new `as any`" gate to Phase 1/5 acceptance.

---

## INFO

### I1. `packages/types/src/` is essentially empty
Only file is `better-auth.ts` re-export. None of the proposed types (`via`, `EarnReason`, `PackageInstanceStatus`, `SalesOrderStatus`, `PayoutMethod`) currently live there or anywhere else as shared aliases. There is **no conflict** to worry about — but also no central place to put these new unions. Recommend Phase 1 add `packages/types/src/commission.ts` and `packages/types/src/package-instance.ts` and re-export, so the seven downstream consumers can import a single source of truth instead of redeclaring.

### I2. `pricePremiumBps` map — ensure return type from `installmentPlans.list` includes it
Plan §3 native picker maps `pricePremiumBps` to a label (line 117). Service `listInstallmentPlans` returns the full row including this column (`packages/services/src/installment-plan.service.ts`). Verified — no action needed; this is informational confirmation that the cited client call shape will type-check once `organizationId` is added (see M2).

### I3. No `pgEnum` for `package_instance_status` is fine — but document the convention
This codebase deliberately stores most workflow statuses as `text` with inline comments, not `pgEnum`, except for two recent additions. The plan should pick a side: either keep the convention and add CHECK constraints for the two new values, or migrate `status` to a real enum across all readers. Mixing approaches makes future audits harder.

---

## Summary table

| Sev      | # | Finding                                                                                  |
|----------|---|------------------------------------------------------------------------------------------|
| CRITICAL | 3 | Non-existent ENUMs (C1), closed `statusSchema` rejects new values (C2), invented `payout_management` resource (C3) |
| HIGH     | 4 | Missing `organizationId` in proc inputs (H1), no shared `via` type (H2), `frozenUntil` tz unspecified + missing from SQL (H3), `salesOrderId` nullability mismatch risk (H4) |
| MEDIUM   | 8 | Status badge fall-through (M1), broken sample call (M2), missing `commission_deferred` column (M3), trainer null guards (M4), payment-method discriminated-union gap (M5), freeze `until` type unspecified (M6), `addDays` unbounded (M7), `staffIds` not UUID-validated (M8) |
| LOW      | 4 | `??` fallback root cause (L1), audit payload (L2), shared sales-status type (L3), cap `as any` count (L4) |
| INFO     | 3 | `packages/types` is empty — good place for new aliases (I1), `pricePremiumBps` confirmed available (I2), enum-vs-text convention (I3) |

Total: **22 findings** (3 build-blocking, 4 financial/auth-grade unsafety).

## Top 5 must-fix before implementation starts
1. **C1** — Remove all `ALTER TYPE` statements from migration 0010; widen literal sets in Drizzle/zod instead.
2. **C2** — Update `statusSchema` in `package-instances.ts:41` to include `"frozen"`, `"completed"` in the same PR as Phase 5 schema.
3. **C3** — Replace every `payout_management` reference with the existing `commission_payout` resource.
4. **H1 + M2** — Add `organizationId: z.string().uuid()` to every new procedure input; correct the §3 native sample call.
5. **H3 + M3** — Add the missing `frozen_until` and `commission_deferred` ADD COLUMNs (with `{ withTimezone: true }` on the timestamp) to migration 0010 and the corresponding Drizzle schemas.
