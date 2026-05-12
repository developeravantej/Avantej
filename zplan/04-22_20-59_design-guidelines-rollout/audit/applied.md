# Audit Apply: 04-22_20-59_design-guidelines-rollout (round 3)

**Applied:** 2026-04-23 00:10
**Source report:** audit/report.md (audited 2026-04-23 00:00)
**Plan file:** plan/plan.md
**Freshness:** ok (report written after most recent plan edit)
**Note:** Round 1 (2026-04-22) fixed 7 critical broken refs. Round 2 (2026-04-23 09:50) applied the 6-lens swarm findings. This round 3 is the post-downgrade cleanup — current status was already `needs-attention`, so there's little left to auto-apply.

## Summary

| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 0 (none remaining) |
| Broken refs left as TODO | 0 |
| Callers added to impact section | 0 (none remaining) |
| Structural sections stubbed | 0 (all 8 sections present) |
| Unresolved questions consolidated | 0 (all 7 already in §8 + inline annotations) |
| Stale TODO comments cleaned | 2 |
| Deferred (process gaps) | 4 |

## Changes

### Auto-fixes

- **§1 Scope — In** — removed stale `<!-- TODO (audit): plan previously listed components/expenses/** … -->` comment and replaced with an explicit parenthetical clarifying that no such directory exists (finding: report Priority Action #2).
- **§5 Phase 4.F.10** — removed stale `<!-- TODO (audit): components/expenses/** directory does not exist … -->` comment and replaced with `(Scope: route file only — no components/expenses/** directory exists.)` (finding: report Priority Action #2).

### TODOs injected

None. The remaining audit findings are user-judgment decisions that the apply rules require left as-is:

- **§8.1** native scope — decision owner: engineering lead. Already stated as "Default: Token-only parity" with decision pending. Cannot auto-decide.
- **§8.4** attendance anti-duplicate Option A vs B — pending; Option A preferred per audit report but needs ratification. Cannot auto-decide.
- **§8.5–8.7** step-chip colour, activity dot pattern, orange-600 announcements — all pending design/product review. Cannot auto-decide.
- **§8.4 M7 race window** — already annotated inline with `<!-- audit-swarm: M7 ... -->` marker. No further edit needed.

### Deferred (process gaps)

- No `execute/log.md` → run `/execute` when ready. Phase 0 primitives are the unblocking task.
- No `chrome-test/plan.md` → run `/chrome-plan` when browser verification is in scope.
- No `research/brief.md` → not required for a visual/structural refactor.
- No `prompts/` → not required unless handing off via `/orchestrator`.

## Next steps

1. **Engineering lead** — formally ratify §8.1 (native token-only parity default) before Phase 6.3 runs.
2. **Before Phase 5** — decide §8.4 Option A vs B and schedule M7 race-window backend fix.
3. **Before Phase 4.B.1, 4.I.1, 4.I.2** — close §8.5–8.7 design calls.
4. **Phase 2.0** — create `.github/workflows/lint.yml` + `pull_request_template.md` scaffold as planned; these are outputs, not prerequisites.
5. Re-run `/audit 04-22_20-59_design-guidelines-rollout` to confirm the plan is clean; expected status = `clean` once §8 items are closed.
