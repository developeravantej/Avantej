# Audit: 04-18_15-17_tracking-pages-plan

**Audited:** 2026-04-18 20:15
**Plan corpus:** `plan.md` + 7 sub-plans (`01-customer-directory.md` … `07-attendance.md`) + `impact-analysis.md` + `open-questions.md`
**Status:** needs-attention

## Scorecard

| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 3 substantive (see below) |
| Missing impact | 0 critical gaps found |
| Unresolved questions | 0 — all 11 OQs have explicit defaults captured in `open-questions.md` |
| Execution state | not started (only `plan/` populated) |

## Findings

### Structural gaps
None. All eight `/plan` sections are covered across the master plan and the dedicated `impact-analysis.md` / `open-questions.md` companion files. Self-awareness is unusually good — plan explicitly flags that `commission_management` is unseeded, `package_instances` has no `branchId`, and the latest migration is `0018_installment_plan_premium`.

### Broken references (plan → codebase)

**Substantive (must fix before `/execute`):**

1. **`context.controlPanelDb` access pattern** — referenced in every new router handler across phases 1, 2, 3, 5, 6, 7. Actual codebase pattern is `context.honoContext?.get("controlPanelDb")` (verified in `members.ts:108`, `invitations.ts`, `hierarchy.ts`, `payouts.ts`). This is a cross-cutting correction affecting most new routers.

2. **`service.credits` / `service.durationDays` columns (§04-pos-record-sale.md §4.1 step 13a)** — neither column exists on the `services` table. Actual schema uses `duration` (seconds) plus `durationUnitType`. The POS package-creation branch needs a different source for these values.

3. **Permission seed row shape** — all new phases add `{resource, action, description}` entries, but existing `SEED_PERMISSIONS` uses `{resource, action}` only. Either the `permissions` table has no `description` column (in which case the seeds will fail) or existing seeds are under-specified. Verify against schema before executing.

**To-be-created files (correctly absent, no conflicts):**
- `customers/view.tsx`, `memberships/view.tsx`, `audit/view.tsx`, `refunds/view.tsx`, `commissions/view.tsx`, `attendance/view.tsx`, `sales/create.tsx`
- All new service files in `packages/services/src/` and router files in `packages/api/src/routers/`

### Missing impact
No critical gaps identified. `impact-analysis.md` lists the expected caller surfaces for touched files.

### Unresolved questions
None — `open-questions.md` captures 11 OQs, each with an explicit default/decision recorded inline.

### Execution & verification gaps
- No `execute/log.md` → plan has not been run through `/execute` or `/execute-pro`
- No `chrome-test/plan.md` or `results.md` → no browser-verification plan or evidence
- No `research/brief.md` → no research artifact (plan explicitly did its own inline research, which is fine)
- No `prompts/` contents → no orchestrator handoff prompt generated

## Priority Actions

1. **Cross-cutting: fix `controlPanelDb` access pattern** in every new router handler before execution. Replace `context.controlPanelDb` with `context.honoContext?.get("controlPanelDb")` or add the matching property to the context type, whichever is the project convention (grep `controlPanelDb` in `packages/api/src/routers/*.ts` first to confirm the dominant shape).
2. **Fix §04-pos-record-sale.md §4.1 step 13a** — rewrite the package-instance creation path to use the actual `services` columns (`duration`, `durationUnitType`) rather than the non-existent `credits` and `durationDays`.
3. **Verify `permissions` table schema** before seeding — either add a `description` column in an earlier migration or drop `description` from the seed rows to match the existing `{resource, action}` shape.
4. **Generate a `/chrome-test/plan.md`** before shipping — seven new pages is a lot of surface to leave un-verified.

## Status rationale
- Not **critical** (no missing plan file, broken refs count is 3 — below the ≥3-of-the-severe-kind threshold; these are fixable, not structural).
- Not **clean** — the three broken refs above will cause immediate failures during `/execute` if not addressed; execution/verification lifecycle has not been touched.
- **needs-attention** — plan is executable once the three refs are patched.
