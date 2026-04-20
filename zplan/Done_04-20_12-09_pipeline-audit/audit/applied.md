# Audit Apply: 04-20_12-09_pipeline-audit

**Applied:** 2026-04-20
**Source report:** audit/report.md (audited 2026-04-20)
**Plan file:** plan/plan.md
**Freshness:** ok

## Summary

| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 10 |
| Broken refs left as TODO | 1 |
| Callers added to impact section | 2 |
| Structural sections stubbed | 0 |
| Unresolved questions consolidated | 0 (already in §8) |
| Deferred (process gaps) | 4 |

## Changes

### Auto-fixes

- **`finalizeSale` → `recordPosSale`** (replace_all, 7 occurrences across §3, §4, phases B.3, C.1, D.1, §6)
- **`check-in.service.ts` → `check-ins.service.ts`** (replace_all, 2 occurrences in A.2 tasks and Files list)
- **`package.service.ts` → `package-instance.service.ts`** (replace_all, 1 occurrence in B.3 Files)
- **`sales/new.tsx` → `sales/create.tsx`** (replace_all, 2 occurrences in B.3 tasks and Files)
- **`/dashboard/sales/new` → `/dashboard/sales/create`** (Journey B4 trigger)
- **`components/tables/commissions/*` → `components/commissions/*`** (C.2 Files)
- **`processRefund` location: `pos.service.ts` → `refunds.service.ts`** (§3 architecture, A.2.1, with NOT-`pos.service.ts` clarifier added to §3 line to prevent recurrence)
- **Phase A.2 Files list:** `pos.service.ts` → `refunds.service.ts`
- **Phase B.2 Files list:** `pos.service.ts` → `refunds.service.ts`
- **Phase C.1 Files:** collapsed `services/$id.tsx` and `services/new.tsx` → single `service/view.tsx` entry (only one services admin page actually exists)
- **Phase C.2 Files:** `staff/$id.tsx` → `trainers/view.tsx`
- **Phase C.2 task C.2.1:** "New route …commissions/view.tsx" → "Extend existing route" (route already scaffolded at `commissions/view.tsx` + `commissions/my.tsx`)
- **Phase C.2 Files:** `commissions/view.tsx (new)` → `(modify — already exists)`
- **§6 caller table:** `processRefund — grep: routers/pos.ts` → `routers/refunds.ts, routers/installments.ts`

### Callers added to impact

- **Phase B.2 Files:** added `packages/api/src/routers/installments.ts` — calls `processRefund`; full-vs-partial amount comparison must be verified for installment-driven refunds.
- **Phase B.3 Files:** added `packages/api/src/routers/package-instances.ts` — calls `createPackageInstance`; the nullable-`client_id` XOR CHECK constraint will break this caller unless it is updated in the same PR as migration 0014.

### TODOs injected

- **Journey B2 step 3:** `pos.processRefund(...)` → `refunds.process(...)` with `<!-- TODO (audit): verify exact oRPC procedure name in routers/refunds.ts -->` — could not unambiguously determine the public procedure name without reading the router; flagged for author confirmation.

### Deferred (process gaps — not plan issues)

- No `execute/log.md` → run `/execute` when plan is approved.
- No `chrome-test/` → run `/chrome-plan` after execution for Journeys B1, B2, B3, B4, C1.
- No `research/brief.md` → not needed (audit already verified code state).
- No `prompts/` → not needed unless handing off to another agent.

### Not applied — already correct in plan

- **OQ2, OQ3, OQ5** — already listed under §8 Open Questions / Risks with the correct "decision needed" framing; audit flagged them as "still unresolved" but no plan edit is required. They are process items to resolve before execution, not plan gaps.
- **`createCommissionSplitsForPos` as a new function** — plan's §3 describes it as what the new POS hook will call; the symbol is correctly introduced as new work, not a broken reference.
- **`appointment-status-machine.ts`** — correctly described as new file to create.

## Next steps

1. Resolve the injected `<!-- TODO (audit) -->` in Journey B2 (confirm the oRPC procedure name on `routers/refunds.ts`).
2. Answer OQ2 (check-in credit decrement semantics) with product before Phase A.2 ships; a "remove" answer deletes task A.2.3.
3. Answer OQ3 (Option A commission config for now, Option C later?) — stakeholder sign-off before Phase C.1 migration.
4. Re-run `/audit 04-20_12-09_pipeline-audit` to confirm the plan is clean.
5. Run `/execute zplan/04-20_12-09_pipeline-audit/plan/plan.md` when ready.
