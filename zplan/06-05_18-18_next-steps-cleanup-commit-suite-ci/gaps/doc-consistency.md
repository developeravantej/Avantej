# Doc-Consistency Audit — `server-holding-it-back.md`

**Audited:** 2026-06-06
**Plan:** `zplan/06-05_18-18_next-steps-cleanup-commit-suite-ci/prompts/06-05_18-33_server-holding-it-back.md`
**Scope:** Verify file paths, line numbers, symbol names, counts, and "is this still a real problem" status for the 6 review findings.

## TL;DR — Stale Findings

| Finding | Status | Action |
|---|---|---|
| 1. Brittle positional select-counter | **REAL** | Execute |
| 2. Shallow CRUD tests (installment-plan) | **REAL** | Execute |
| 3. `sel`/`selectChainResolving` DRY violation | **REAL but mis-scoped** | Execute with corrected file list |
| 4. Latent test-order bug (`mockSelectResult` not reset) | **STALE — already fixed** | DO NOT execute |
| 5. Tenant-middleware debt | **REAL** | Execute |
| 6. No cross-tenant isolation unit test | **STALE — already covered** | DO NOT execute |

**Prior manual review's conclusion that findings 4 and 6 are already resolved is CONFIRMED.** Both are non-problems; executing them would be wasted effort (4 would re-add a reset that exists; 6 would re-add a test that exists).

---

## Finding-by-Finding

### Finding 1 — Brittle positional `switch(n)` select-counter — INFO (accurate)
**Plan claims:** `commission-diff-harness.test.ts` uses `switch(n)` on the select-call index; `default: return sel([])` hides misalignment.
**Actual:** Confirmed. `apps/server/src/tests/unit/services/commission-diff-harness.test.ts` contains **8** `switch (n)` blocks (lines 107, 169, 234, 314, 370, 431, 510 — plus the helper at line 633 is a separate diff formatter). Every switch ends with `default: return sel([])` (lines 156-157, 221-222, 301-302, 357-358, 418-419, 497-498, 548-549).
**Rating:** INFO — claim is accurate, plan is executable.

### Finding 2 — Shallow passthrough CRUD tests — INFO (accurate)
**Plan claims:** `installment-plan.test.ts` asserts `result` equals the exact fixture (passthrough); `activeOnly` test passes trivially without verifying the query filter.
**Actual:** Confirmed in `apps/server/src/tests/unit/services/installment-plan.test.ts`:
- Passthrough: line 32 `expect(result as any).toEqual(plans)` after the mock returned `plans` (line 28). Same pattern at lines 63, 83.
- `activeOnly` test (lines 44-52): mocks `findMany` to return one active plan, then asserts `result` has length 1 and `isActive === true` — it never asserts that the `activeOnly` filter was passed into the query. Trivially green.
**Rating:** INFO — claim is accurate.

### Finding 3 — `sel`/`selectChainResolving` DRY violation — MEDIUM (real, but count + named files wrong)
**Plan claims:** "re-defined in at least 4 files (`commission-diff-harness.test.ts`, `installment.test.ts`, `sequence-numbers.test.ts`, others)".
**Actual:** The DRY violation is **real and far larger** — **16 files** locally define a select-chain helper (`grep -rln "function selectChainResolving|function sel(|const sel =" apps/server/src/tests` → 16). BUT two of the three explicitly named files are **WRONG**:

- `commission-diff-harness.test.ts` — defines `function sel(...)` at line 71. ✅ Correct.
- `installment.test.ts` — **does NOT** define `sel`/`selectChainResolving`. It uses an entirely different pattern: a module-level `const mockSelectResult: any[]` + `mockLimit`/`mockSelect` mocks (lines 15-63). ❌ Plan is wrong.
- `sequence-numbers.test.ts` — **does NOT** define `sel`/`selectChainResolving`. It uses ad-hoc per-test `mockSelect`/`canSelect`/`srSelect`/`toSelect` chains (lines 56, 62, 202, 387, 481). ❌ Plan is wrong.

The actual 16 files defining the helper:
```
fixtures/commission-golden.capture.test.ts:63          (function sel)
unit/services/commission-diff-harness.test.ts:71       (function sel)
unit/services/analytics.test.ts:11                     (function selectChainResolving)
unit/services/announcements.test.ts:17
unit/services/category-commission.test.ts:95
unit/services/class-slots.test.ts:9
unit/services/commission-rule.test.ts:85
unit/services/expenses.test.ts:19
unit/services/customer-directory.test.ts:39
unit/services/commission-splits.test.ts:20
unit/services/promotions.test.ts:16
unit/services/purchase-orders.test.ts:16   (line 16)
unit/services/refunds.test.ts:84
unit/services/payouts.test.ts:29
unit/services/trainer-tier.test.ts:54
unit/services/waitlist.test.ts:21          (function selectChainResolving(rows: unknown[]) — different signature)
```
**Impact on plan:** Task 1 ("replace the locally-redefined helpers in the 4+ test files") will mislead an executor into editing `installment.test.ts` and `sequence-numbers.test.ts`, which have NO such helper — wasted churn / risk of breaking their bespoke mocks. The real consolidation target is the 16-file `selectChainResolving`/`sel` cluster above. Note `waitlist.test.ts` has a divergent signature (`rows: unknown[]` vs `value: unknown`) — a single canonical helper must accommodate both.
**Rating:** MEDIUM — finding is real, but the named-file list and "at least 4" undercount are materially off and would misdirect execution.

### Finding 4 — Latent test-order bug (`mockSelectResult` not reset) — HIGH (STALE / already fixed)
**Plan claims:** `installment.test.ts` has a module-level `const mockSelectResult: any[] = []` "pushed-to across tests but never reset in `beforeEach`".
**Actual:** The reset **already exists**. `apps/server/src/tests/unit/services/installment.test.ts`:
- line 15: `const mockSelectResult: any[] = [];`
- line 101: `mockSelectResult.length = 0;` — **inside the `beforeEach`** (block spans the `mockClear()` calls at lines 95-99, comment "// Reset select result" at line 100, closing `});` at line 102).
The array IS reset every test. The order-dependence bug the plan describes does not exist in the current tree.
**Rating:** HIGH (claim materially false — already resolved). **Prior manual review CONFIRMED. Do not execute Task 3** (it would re-add a reset that is already present).

### Finding 5 — Tenant-middleware debt — INFO/MEDIUM (accurate, minor line drift)
**Plan claims:** `orpc-tenant.middleware.ts` ~286 LOC; duplicate public-endpoint detection across 3 places (path-based ~lines 28-32, two method-based ~lines 89-102); `console.log("✅ Tenant DB set up …")` ~line 201 fires on every prod request.
**Actual (file = `apps/server/src/middleware/orpc-tenant.middleware.ts`):**
- LOC: 286 lines (Read shows 286; `wc -l` = 285 because no trailing newline). ✅ Accurate.
- Path-based public-endpoint check (`isInvitationPublicEndpointByPath`): **lines 28-32**. ✅ Exact.
- Method-based check (`isInvitationPublicEndpointByMethod`): **lines 89-102** (one big OR-block covering both `invitations.*`/`invitations/*` and `registration.*`). ✅ Exact. (The "two method-based checks" framing is slightly loose — it's one combined predicate with two sub-groups — but the consolidation target is correct.)
- `console.log("✅ Tenant DB set up successfully …")`: **lines 200-203** (plan said ~201). Fires unconditionally on the happy path of every authenticated oRPC request. ✅ Accurate. (Note: there are several other unconditional `console.log`/`console.warn` calls on hot paths too — lines 109, 249-251, 255-257 — worth folding into the same debug-gate cleanup.)
**Rating:** INFO (LOC + line numbers accurate to ±1). Finding is real.

### Finding 6 — No cross-tenant isolation unit test — HIGH (STALE / already covered)
**Plan claims:** "no negative test supplies a mismatched `organizationId` and expects rejection".
**Actual:** Such a test **already exists** in `packages/api/src/guards.test.ts`:
- lines 29-30: `const ORG_A` / `const ORG_B` fixtures.
- lines 62-69: `describe("assertOrgContextMatch")` → `it("rejects an input organizationId that does not match the authenticated tenant")` — builds `ctx` with `organizationId: ORG_A`, calls `assertOrgContextMatch(ctx, { organizationId: ORG_B })`, expects throw (line 66).
- Plus hardening cases: matching org passes (71-75), null context org no-ops (79-84), trailing-whitespace mismatch rejects (88-90), empty-string input fails-closed (341-347).
The exact negative test the plan asks for is present and (per the branch's green suite) passing.
**Rating:** HIGH (claim materially false — already covered). **Prior manual review CONFIRMED. Do not execute Task 6** (it would duplicate `guards.test.ts`).

---

## Scope-Section File Existence Check

All in-scope files exist:

| File | Exists | Notes |
|---|---|---|
| `apps/server/src/tests/helpers/db-mock.factory.ts` | ✅ | Only exports `createMockTenantDb()` (line 77); **no** select-chain helper yet — Task 1's "add canonical helper" is genuinely needed. |
| `apps/server/src/tests/unit/services/commission-diff-harness.test.ts` | ✅ | |
| `apps/server/src/tests/unit/services/installment.test.ts` | ✅ | Does NOT redefine `sel`/`selectChainResolving` (see Finding 3). Reset already present (Finding 4). |
| `apps/server/src/tests/unit/services/installment-plan.test.ts` | ✅ | |
| `apps/server/src/tests/unit/services/sequence-numbers.test.ts` | ✅ | Does NOT redefine `sel`/`selectChainResolving` — uses bespoke `mockSelect`/`canSelect`/`srSelect`/`toSelect` (lines 56, 62, 202, 387, 481). Plan's implication is FALSE. |
| `apps/server/src/middleware/orpc-tenant.middleware.ts` | ✅ | |
| `packages/api/src/guards.test.ts` (implied by Task 6) | ✅ | Already contains the cross-tenant test. |

---

## Net Recommendation

Execute **Findings 1, 2, 5** as written (accurate). Execute **Finding 3** but **replace the named-file list** — the real targets are the 16 `selectChainResolving`/`sel` files listed above, and `installment.test.ts` + `sequence-numbers.test.ts` must be **removed** from Task 1's edit list (they use unrelated mock patterns; editing them risks breakage). **Drop Findings 4 and 6 entirely** — both are already resolved in the current tree; the corresponding Tasks 3 and 6 are no-ops at best, churn-and-duplicate at worst.
