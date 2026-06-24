# Audit Apply: 05-12_12-42_trainer-availability-booking

**Applied:** 2026-05-12 12:55
**Source report:** audit/report.md (audited 2026-05-12)
**Plan file:** plan/plan.md
**Freshness:** ok

## Summary

| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 0 (no plan-blocking broken refs) |
| Broken refs left as TODO | 0 |
| Callers added to impact section | 2 |
| Structural sections stubbed | 0 (8/8 already present) |
| Unresolved questions consolidated | 3 (re-prioritized with BLOCKING bands) |
| TODOs injected | 3 |
| Deferred (process gaps) | 4 |

## Changes

### Auto-fixes

- **§6 Impact table** — replaced the vague `appointments.create` caller row with concrete grep results: `apps/web/src/components/calendar/appointment.tsx:79` and `apps/web/src/components/appointments/appointment-list.tsx:54`, plus a breakage-risk note tying back to OQ #3.
- **§6 "Trace: who calls `appointments.create`?"** — replaced the speculative "likely callers" list with the audit's confirmed grep results; left per-caller `packageInstanceId` confirmation as TODO markers.
- **§5 Phase 2.1** — marked as ✅ pre-done on current branch (verified at `book-workout.tsx:133-134`); kept as a re-verify gate.
- **§5 Phase 2.2** — expanded with explicit field types (`status: string | null`, `expiresAt: string | null`) and the file path, plus the audit-verified note that neither exists yet.
- **§5 Phase 1.1** — added `members.isDeleted = false` filter to the new service spec.
- **§5 Phase 1.5 (new task)** — added a backfill task to also apply the soft-deleted filter to existing `listTrainerAvailability` since the file is open in Phase 1.
- **§5 Phase 1.0 (new prereq)** — added a blocking timezone prerequisite tied to OQ #2.

### TODOs injected

- **§5 Phase 1.0** — `<!-- TODO (audit): confirm timezone convention + decide whether to thread org timezone through computeAvailableSlots -->`
- **§8 OQ #2** — `<!-- TODO (audit): verify timezone convention against production data -->`
- **§8 OQ #3** — `<!-- TODO (audit): inspect each web caller, confirm whether packageInstanceId is passed, decide guard scope -->`

### Unresolved questions consolidated

- §8 Open Questions list re-prioritized with explicit blocking bands (🔴 BLOCKING vs 🟡 BLOCKING vs unranked) so the executor knows which questions gate which phase.
- OQ #1 + OQ #2 marked BLOCKING for Phase 1; OQ #3 marked BLOCKING for Phase 4.

### Deferred

- No `execute/log.md` — run `/execute` after the 3 BLOCKING OQs are resolved.
- No `chrome-test/` — run `/chrome-plan` if browser verification is wanted for the web calendar/appointment-list create paths after Phase 4.
- No `research/brief.md` — not needed for this scope.
- No `prompts/` — not needed unless handing off to subagents.

## Next steps

1. ✅ **OQ #2 RESOLVED 2026-05-12 13:05** via DB inspection:
   - Both availability tables store admin's local wall-clock HH:MM (verified against web admin display).
   - `organizations` has no `timezone` column.
   - Cloudflare Workers run UTC → `Date.getHours()` returns UTC, mismatched against local-wall-clock window strings.
   - Active double-book bug already in prod, independent of Phase 1.
   - **Decision:** add `timezone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur'` to `organizations`. Plan tasks Phase 1.0a + 1.0b + 4.5 updated to thread it through.
2. ✅ **OQ #3 SELF-ANSWERED** (re-audit 2026-05-12 13:00): web callers (`calendar/appointment.tsx:79`, `appointment-list.tsx:54`) pass no `packageInstanceId`; server guard fires only when present → staff flows naturally exempt. Awaits product sign-off; no code change needed.
3. ✅ **OQ #1 RESOLVED 2026-05-12 13:10** — Option A picked (union read). Phase 6 deferred indefinitely.
4. Re-run `/audit 05-12_12-42_trainer-availability-booking` to confirm the plan is clean.
5. Phase 1 + 2 + 3 unblocked — begin implementation.
