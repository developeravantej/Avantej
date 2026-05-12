# Audit: 04-22_20-59_design-guidelines-rollout

**Audited:** 2026-04-23 00:00
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard

| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 0 (all 7 original broken refs patched by applied.md round 2) |
| Missing impact | 0 (inline BranchCombobox copies now documented in §3.5 + §6.2) |
| Unresolved questions | 7 (5 open decisions + 2 expense-dir TODOs) |
| Execution state | not started |

## Findings

### Structural gaps

None — all 8 required sections are present with substantive content.

### Broken references (plan → codebase)

**None.** All 7 references flagged in the original audit report (2026-04-22) were corrected by the swarm audit + `applied.md` round 2:

- `commissions.ts` / `commissions.bulkApprove` → `commission-splits.ts` / `commissionSplits.approve` ✓
- `attendance.ts` / `attendance.service.ts` → `check-ins.ts` / `check-ins.service.ts` ✓
- `components/appointment-list.tsx` → `components/appointments/appointment-list.tsx` ✓
- `apps/native/theme.ts` → `apps/native/global.css` + `apps/native/lib/colors.ts` ✓
- `components/expenses/**` → documented as TODO (directory never existed; expenses inline in route file)

Verified live: all modified file references now point to existing files.

Note: `.github/workflows/lint.yml` and `.github/pull_request_template.md` are MISSING — but these are Phase 2.0/2.4 **output** files (plan creates them), not broken refs.

### Missing impact

None. The three inline `BranchCombobox` re-implementations that escaped Phase 0.6 deprecation are now listed in §3.5 and §6.2:
- `apps/web/src/components/pages/stock/transfers-tab.tsx`
- `apps/web/src/components/pages/stock/requests-tab.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/rooms/view.tsx`

### Unresolved questions

Seven items remain open, none blocking Phase 0–3 work:

| # | Item | Severity | Blocks |
|---|------|----------|--------|
| 8.1 | Native app scope beyond token parity | Decision pending (default stated) | Phase 6.3 |
| 8.4 | Attendance anti-duplicate: Option A vs B | Decision pending | Phase 5.2 |
| 8.5 | Step-chip colour (`bg-primary` vs `bg-brand-secondary-2`) | Design review | Phase 4.B.1 |
| 8.6 | Activity dot pattern (approved exception or StatusBadge) | Ratification pending | Phase 4.I.2 |
| 8.7 | Orange-600 announcements badge mapping | Low — proposed default | Phase 4.I.1 |
| — | `components/expenses/**` scope decision (two `<!-- TODO (audit): … -->` comments in plan) | Low — affects 4.F.10 scope | Phase 4.F.10 |
| — | M7 race window in `recordCheckIn` (noted in §8.4 annotation) | Backend task to resolve | Phase 5.2 |

Resolved (marked RESOLVED in §8): 8.2 (Biome custom script confirmed), 8.3 (void is load-bearing), 8.8 (expenses currency fix folded into Phase 1.4).

### Domain Logic Warnings

None. The plan correctly uses domain vocabulary throughout (franchisee, member, walk-in, branch, class slot, POS sale, freeze). No domain invariant violations were detected:
- No new DB schema changes — purely visual refactor, so multi-tenant isolation is unaffected.
- StatusBadge canonical map now includes `void` as distinct from `cancelled` (confirmed load-bearing in commission-splits).
- Anti-duplicate window logic references the correct 30-min guard in `check-ins.service.ts`.

### Execution & verification gaps

- No `execute/log.md` → plan has not been executed (expected — plan is newly authored)
- No `chrome-test/plan.md` → no browser verification plan yet
- No `research/brief.md` → not required
- No `prompts/` → no handoff prompts generated

## Priority Actions

1. **Decide Phase 5.2 anti-duplicate option** (§8.4) before starting Phase 5 — pick Option A (pre-flight `client.checkIns.list`, zero server change) or Option B (extend CONFLICT response with `minutesAgo`). Option A is lower risk. Also schedule the M7 race-window fix (`recordCheckIn` duplicate check outside transaction) as a separate backend task.

2. **Clarify expenses scope for Phase 4.F.10** — `components/expenses/**` does not exist. Phase 4.F.10 must reference only `expenses/view.tsx`. Remove the TODO comments and make the scope explicit.

3. **Confirm 8.1 native scope** — engineering lead needs to formally ratify "token-only parity" before Phase 6.3 runs, so the parity check uses the right target files (`global.css` + `lib/colors.ts`, now verified to exist).

4. **Ship Phase 0 primitives** — plan is structurally sound and Phases 0–4 are unblocked. Phase 0 is a hard prerequisite for Phase 2 (Biome enforcement). Run `/execute` when ready.

5. **Create `.github/` directory scaffold (Phase 2.0)** — Phase 2 enforcement cannot land without this. Consider adding it to Phase 0 or as a parallel track.

## Status rationale

**needs-attention** — 8/8 sections, 0 broken refs, 0 missing impact. All original `critical` findings from round 1 have been patched. Status downgraded from critical to needs-attention. Remaining items are 7 open decisions/risks that should be closed before Phase 5 (and one before Phase 6.3), but Phase 0–4 work can proceed today without resolving them.
