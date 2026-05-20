# Doc-Consistency Audit — `05-12_17-10_sales-pipeline-fixes/plan/plan.md`

Audited: 2026-05-12. Source files cross-checked against current `feat/package-approval-flow` branch.

---

## CRITICAL — plan unexecutable as written

### C-1. Native paths are entirely wrong

Plan repeatedly cites `apps/native/src/screens/buy-package/plan.tsx` and `pay.tsx` (Phase 3, §3 Architecture, §4 Journey E, §5 Phase 3, Files Affected lists, Phase 7.7).

**Reality:** there is no `apps/native/src/screens/` directory. The actual files live at:
- `apps/native/app/(app)/dashboard/buy-package/plan.tsx`
- `apps/native/app/(app)/dashboard/buy-package/pay.tsx`
- `apps/native/app/(app)/dashboard/buy-package/_layout.tsx` (and 9 sibling step files: `done`, `info`, `review`, `schedule`, `setup`, `sign`, `terms`, `trainer`)

The repo uses Expo Router file-based routing under `app/`, not a `src/screens/` layout.

Also: plan §3 says "Replace the hardcoded `PLANS` const at `apps/native/src/screens/buy-package/plan.tsx:21`". The actual symbol is `PLAN_CONFIG` (not `PLANS`) at line 21, with the `planKeys` filter at lines 43-45 also depending on it. The hardcoded surface to replace is `PLAN_CONFIG` plus the `["full", "half", "quarterly"] as PlanKey[]` literal at line 43.

Impact: Phase 3 cannot execute as written without rewriting every file path. Also affects `buy-package.context.tsx` reference in §5 Phase 3 Files Affected (file presumably at `apps/native/app/(app)/dashboard/buy-package/...` — not verified to exist with that name).

### C-2. `packages/db/src/schema/tenant/packages.ts` does not exist

Plan cites this in §5 Phase 5 ("`packages/db/src/schema/tenant/packages.ts` — add `frozenUntil` column"). There is **no** `packages.ts` schema file. Package-related schemas are split across:
- `packages/db/src/schema/tenant/package-instances.ts`
- `packages/db/src/schema/tenant/package-instance-staff.ts`
- `packages/db/src/schema/tenant/package-instance-status-history.ts`

The `frozenUntil` column belongs in `package-instances.ts`. Plan must rename the citation. (The current `package-instances.ts` schema confirmed has no `frozenUntil` / `frozen_until` column today.)

### C-3. Migration filename collision — `0010_sales_pipeline_fixes.sql`

Plan §3, §5, §7 all assume the new tenant migration will be `packages/db/src/migrations/tenant/0010_sales_pipeline_fixes.sql`.

**Reality:** the tenant-migrations directory already contains `0010_broad_ronan.sql` — and the latest migrations have advanced to `0050_add_is_recurring_idx.sql`. The next free slot is `0051_*`, not `0010_*`.

Impact: as written, running `bun gen:migrations` would either collide with the existing 0010 file or be ignored. The plan must use the next sequential slot (`0051_sales_pipeline_fixes.sql` at minimum — verify against `migrations.json` ordering at execute time).

---

## HIGH — broken cross-phase dependencies / missing prerequisites

### H-1. Phase 5 dep claim "Phase 1 schema migration must merge first" is internally inconsistent

Phase 1 §1.2 adds `commission_splits.earn_reason` to `0010_sales_pipeline_fixes.sql`. Phase 5 §5.1 adds enum values + `frozenUntil` column to *the same* file. Phase 7.14 also references the migration (CHECK trigger).

If all three phases write to one file, the dep "Phase 1 schema must merge first" is meaningless — they're the same migration. Either:
- (a) merge them as one migration shipped with Phase 1, with downstream phases purely code; or
- (b) split into separate sequentially-numbered migrations.

The plan as written conflates the two models. Combined with C-3 (slot collision), the migration story needs a full rewrite.

Additionally: §6 "Risks → Enum ALTER TYPE ordering" warns that Postgres requires the enum value to be visible *one deploy before* code uses it ("two-deploy plan"). This contradicts the single-migration model in §3 — if Phase 5 code uses `'frozen'` / `'completed'` in the same release as the migration adding them, the deploy is unsafe per the plan's own risk note.

### H-2. Phase 2 "previewBatch must be cursor-paginated" — but `payouts.service.ts` extension contract is hand-waved

§2.1 says service is `packages/services/src/payouts.service.ts` (extend existing). §6 Phase 2 references `processCommissionReversals` at `payouts.service.ts:35`. Not verified line-for-line in this audit but the file exists. However the plan does not name an existing function that `runBatch` should reuse vs. write fresh — high risk of duplicate logic against existing payout code paths. Acceptable severity but worth flagging.

### H-3. `payout_management` permission does not exist

§2.5 says "Add `payout_management` to `Resource` enum if not present". Confirmed not present in `packages/services/src/permission.service.ts` (only `package_management` is at line 40). This is correctly identified as TODO in the plan, but it has a downstream consequence not flagged: the plan's §3 API contract table lists `payouts.previewBatch` and `payouts.runBatch` as gated by `payout_management` — that gate does not exist yet, so Phase 2 cannot be implemented in any order other than: add resource → seed grant → wire procedure → wire UI. Plan should make this sub-ordering explicit.

---

## MEDIUM — stale lines / symbol-name drift

### M-1. `runAppointmentCommission` signature in §1.1 conflicts with actual call site

Plan §1.1 says "Add param `{ via: 'completion' | 'cancellation' }`". §6 Impact analysis lists `appointment.service.ts:622` as the existing completion caller.

Verified: the actual call at `appointment.service.ts:638` (and 641) is:
```ts
await runAppointmentCommission(tx, id, updated, params.actor);
```
Four positional args, not an options bag. Adding `{ via }` requires either a 5th positional or refactoring the existing signature — plan does not specify which. Both existing callers (lines 638 and 641) need updating, not just one.

Also: line 622 in the plan refers to the *guard* (`if (params.status === "completed" && ...)`), not the *call*. The actual call is at 638/641. The 622–643 range cited in the plan is correct as a "completion branch" range, but the plan's §1.3 line citation "appointment.service.ts:528–559 (cancel branch)" describes a **credit-restore block**, not a separate cancel branch — there is no dedicated cancel handler; cancellation flows through the same `update` path with `params.status === "cancelled"`. The plan's mental model of "cancel branch" vs "completion branch" as discrete handlers is wrong; both are `if`s inside one update transaction.

### M-2. POS commission line range 691–715 is partially correct, but call is conditional

Plan §1.4 says "Remove the `calculateCommissionForPos` call" at `pos.service.ts:691-715`. Verified: the dynamic import is at line 691, the call at 699, the catch ends at line 715. However the call only fires when `input.itemTrainerAssignments` is populated (line 690). The plan does not address the case where assignments are NOT provided (split is never created today either). For non-bookable items per §1.5, this means commission already silently never fires for POS sales without explicit trainer assignments — the "keep current sale-time commission" requirement in §1.5 is **not actually current behaviour** for items lacking trainer assignments.

### M-3. `installment.service.ts:946-1074` symbol drift

Plan §7.12 cites `adminOverview` at `installment.service.ts:946-1074`. Verified: function is named `getAdminInstallmentOverview` at line 946 (not `adminOverview`). Recognizable but should be renamed in the plan to avoid grep failures during execution.

### M-4. `pay.tsx:347-358` wider context

Plan §3.3 / §4 Journey E cite `pay.tsx:347-358`. Verified: line 347-349 contains the ternary `state.paymentPlanType === "half" ? "Half Payment (2×)" : "Quarterly Payment (4×)"` — only two branches; "full" plan is invisible in this label, and any admin-defined plan is a silent fall-through to "Quarterly Payment". The plan calls this out as the issue but the surrounding "First installment" math at 354-360 also hardcodes `/2` vs `/4` and must be replaced with `/selectedPlan.numInstallments`. Plan §3.3 says "Replace string-literal labels" but does not mention the math fix.

### M-5. `package-instances.ts:903` trainer scope citation

Plan §4.4 cites `packageInstances.listPending` at line 903 with "trainer scope: include `accessibleNodeIds`". Verified: the relevant block is at lines 895-906 (the `branchFilterIds` IIFE). Line 903 specifically is `return [context.member.hierarchyScopeId];` — the bug location matches the plan's claim. But the fix proposed ("include accessibleNodeIds") would change behaviour for `assignable_to_me` scope; the existing scope has another path at line 905 that already returns `accessibleNodeIds` for non-trainer roles. Plan should clarify that 903 is in the `assignable_to_me` branch and the fix is "use `accessibleNodeIds` instead of just `[hierarchyScopeId]`" — which is a behaviour expansion, not just a one-line tweak.

### M-6. `packages/api/src/routers/sales-orders.ts` not verified for KPI procedure

§6.2 says "Add an aggregate procedure `salesOrders.kpiSummary({ branchId?, period? })` if frontend can't easily join". File exists. No claim made about specific lines so no drift, but plan never decides which path (FE join vs new procedure). Open question disguised as a decision.

---

## LOW — minor

### L-1. `sales-order.service.ts:268` line correct but subject is the wrong call

Plan §1.7 / §6 say `sales-order.service.ts:268` — "Remove cancellation→commission-void". Verified: line 268-273 is the call to `voidCommissionSplitsForSalesOrder`. Citation accurate. No issue.

### L-2. `package-instances.ts:347-364` web installment create

Plan §7.1 cites `package-instances.ts:347-364` as the "web installment create". Verified: lines 340-365 contain the `createInstallmentSchedule` call inside the package-instance create handler. Range close enough; minor off-by-a-few.

### L-3. `pos.service.ts:264-276` member.role gate

Plan §7.8 cites `pos.service.ts:264-276` for "POS: friendly error when member.role !== 'client'". Verified: the role check is at line 268 (`eq(members.role, "client")`); the throw is at 272-274. Range matches.

---

## Open Questions — verification

All four Open Questions remain genuinely open:

- **Q-1 (accept step real?)** — open. No code path implements `packageInstances.accept`; plan defers decision. Confirmed open.
- **Q-2 (defer commission via new table vs flag column)** — open. Plan picks Option B as default but does not commit. Confirmed open.
- **Q-3 (cancelled-sale commission rule)** — open. Plan §1.7 / §6 both say "get user sign-off before coding". Confirmed open.
- **Q-4 (non-bookable POS commission)** — open. §1.5 makes a proposal pending confirmation. Confirmed open.

None accidentally resolved by the body of the plan.

---

## Summary by severity

| Severity | Count |
|---|---|
| CRITICAL | 3 (native paths, `packages.ts` non-existence, migration slot collision) |
| HIGH | 3 (Phase 5 schema-dep model, payouts service contract, `payout_management` ordering) |
| MEDIUM | 6 (signatures, scope citations, math-not-just-labels) |
| LOW | 3 |

## Recommended doc fixes before /execute

1. Find-replace `apps/native/src/screens/` → `apps/native/app/(app)/dashboard/` everywhere.
2. Rename `apps/native/.../plan.tsx:21` reference to target `PLAN_CONFIG` const + `planKeys` literal at line 43.
3. Replace `packages/db/src/schema/tenant/packages.ts` → `package-instances.ts` (Phase 5 §5.1, Files Affected list).
4. Renumber the new tenant migration to next free slot (≥ `0051_*`) and re-verify against `tenant-migrations.generated.ts` at execute time.
5. Decide between single-migration + same-deploy (and accept the enum-ordering risk noted in §6) vs split-migrations + two-deploy. Make the dep arrow in Phase 5 reflect the choice.
6. Specify the `runAppointmentCommission` signature change explicitly (4-arg → 5-arg with options bag, or wrap in object) and update both call sites at `appointment.service.ts:638` and `:641`, not "the call at :622".
7. Drop the "cancel branch" / "completion branch" framing — both are `if`s inside one transactional update at `:528-559` (credit restore) and `:622-643` (commission gate).
8. Clarify Phase 4.4 fix as "broaden `assignable_to_me` to use `accessibleNodeIds`".
9. Rename plan reference `adminOverview` → `getAdminInstallmentOverview`.
10. Add to §3.3 / Phase 3: also fix the hardcoded `/2` vs `/4` math in `pay.tsx:354-360`, not just labels.
