# Audit: 04-23_12-38_installment-enhancements

**Audited:** 2026-04-23 (session start)
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard

| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 0 (3 missing files are expected new creations, plan-marked) |
| Missing impact | 0 (callers listed or explicitly deferred to execution) |
| Unresolved questions | 4 open questions — OQ#1 blocks Phase 3 |
| Execution state | Not started — no execute/log.md, no chrome-test/, no prompts/ |

## Findings

### Structural gaps

None. All 8 sections are present with substantive content.

### Broken references (plan → codebase)

**Files — all core files verified:**

| File | Status |
|------|--------|
| `packages/db/src/schema/tenant/package-instances.ts` | ✅ EXISTS |
| `packages/db/src/migrate-tenant.ts` | ✅ EXISTS |
| `packages/db/src/schema/tenant/installment-events.ts` | ✅ EXISTS |
| `packages/services/src/installment.service.ts` | ✅ EXISTS |
| `packages/services/src/appointment.service.ts` | ✅ EXISTS |
| `packages/services/src/check-ins.service.ts` | ✅ EXISTS |
| `packages/services/src/index.ts` | ✅ EXISTS |
| `packages/api/src/routers/installments.ts` | ✅ EXISTS |
| `apps/web/src/components/pages/packages/installments-page.tsx` | ✅ EXISTS |
| `apps/server/src/tests/helpers/db-mock.factory.ts` | ✅ EXISTS |
| `apps/server/src/tests/helpers/integration-setup.ts` | ✅ EXISTS |
| `docs/TENANT_MIGRATION_WORKFLOW.md` | ✅ EXISTS |
| `packages/api/src/routers/index.ts` | ✅ EXISTS |
| `apps/server/src/tests/unit/services/appointment.service.test.ts` | ⚠️ MISSING — plan marks "(possibly new)" |
| `apps/server/src/tests/integration/installments.integration.test.ts` | ⚠️ MISSING — plan marks as new |
| `apps/web/src/__tests__/pages/packages/installments-page.test.tsx` | ⚠️ MISSING — plan marks "new if absent" |

The three missing test files are all explicitly flagged in the plan as files to be created during execution. They are not broken refs.

**Symbols — all verified:**

- `getAdminInstallmentOverview` ✅ — `installment.service.ts:866`
- `AdminInstallmentOverviewItem` ✅ — `installment.service.ts:858`
- `AdminInstallmentOverviewParams` ✅ — `installment.service.ts:848`
- `writeAudit` ✅ — imported and used in `installment.service.ts`
- `adminOverview` (procedure) ✅ — `installments.ts:210, 384`
- `confirmPayment` (procedure) ✅ — `installments.ts:26, 380`
- `isLocked` gate at line 264 ✅ — `appointment.service.ts:264` — exact location matches plan §3
- `createMockTenantDb` ✅ — used across multiple test files
- `makeIntegrationAdminContext` ✅ — `integration-setup.ts` exists

The plan's new symbol `setPackageOverdraft` does not yet exist — this is correct since it is a function to be created in Phase 4.

### Missing impact

None critical. The plan §6 identifies all key callers:

- `appointment.service.ts` → called from `packages/api/src/routers/appointments.ts` (listed) and `packages/api/src/routers/pos.ts` (listed).
- Plan explicitly notes "grep for every booking path through appointment.service.ts before Phase 4" as a verification step.
- `getAdminInstallmentOverview` has one caller (`installments.ts` → `adminOverview` procedure) — verified.

One deferred check worth flagging: the plan mentions checking whether `apps/native` routes booking through `appointment.service.ts` (Open Question #3). This is correctly flagged as a risk but not yet verified.

### Unresolved questions

- **OQ#1 — Overdraft semantics:** Should overdraft bypass `isLocked` only (option B, plan default) OR also tighten `appointment.service.ts:271` to use `creditsUnlocked` instead of `creditsTotal` (option A)? **Blocks Phase 3.** Decision required before any schema work begins.
- **OQ#2 — Due-soon window:** 14 days hard-coded vs. 7d or configurable. Low urgency.
- **OQ#3 — Native app booking path:** Does `apps/native` route through `appointment.service.ts`? If not, the overdraft flag would not be honoured in the native app. Unverified.
- **OQ#4 — Overdraft badge in Memberships tab?** Cosmetic/low-priority; deferred.

### Domain Logic Warnings

None. The plan operates correctly within the established domain model:

- Uses `isLocked` (not a new status enum) for the gate — no DB enum change needed.
- `installmentEvents.installmentId` is nullable — plan correctly reuses this for `overdraft_enabled/disabled` events (matches existing `manual_override_unlock` pattern).
- Audit log via `writeAudit(tx, ...)` in same transaction — matches existing `unlockPackage` pattern exactly.
- RBAC check mirrors `manualUnlock` — no new resource type in `permission.service.ts` required.

### Execution & verification gaps

- No `execute/log.md` → plan has not been executed.
- No `chrome-test/` → no browser verification plan yet.
- No `research/` → expected (plan is self-contained).
- No `prompts/` → no handoffs generated yet.

The plan's own status header reads **"Draft — contains open questions that require product decisions before Phase 2+ can begin"** — execution state is consistent with plan intent.

## Priority Actions

1. **Resolve OQ#1 before starting Phase 3.** Ask the product owner: confirm option (A) tighten credits check + overdraft bypasses both locks, or (B) overdraft bypasses `isLocked` only. This is blocking.
2. **Verify native app booking path (OQ#3)** — grep `apps/native` for calls to `appointment.service.ts` or any direct package credit check before Phase 4 begins. One grep call; low effort.
3. **Check `installments.ts` package_instance_id index** (plan §7 scalability note) — plan flags "check if `installments.package_instance_id` has an index before merging"; do this before Phase 1.5 ships.
4. OQ#2 and OQ#4 are low-priority and can be decided after OQ#1.

## Status rationale

8/8 structural sections, 0 broken refs, 0 missing-impact callers unlisted. Sole reason for `needs-attention`: 4 open questions, with OQ#1 explicitly designated as a hard blocker for Phase 3. Plan cannot be fully executed until OQ#1 is answered. Phase 1 and Phase 2 (frontend-only) can proceed without resolving OQ#1.
