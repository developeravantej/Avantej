# Audit Apply: 05-13_22-30_push-notifications

**Applied:** 2026-05-13 22:50
**Source report:** audit/report.md (audited 2026-05-13 22:45)
**Plan file:** plan/plan.md
**Freshness:** ok

## Summary
| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 0 |
| Broken refs left as TODO | 0 |
| Callers added to impact section | 1 |
| Structural sections stubbed | 0 |
| Unresolved questions consolidated | 0 |
| TODOs injected | 3 |
| Deferred (process gaps) | 1 |

## Changes

### Auto-fixes
- §6 Impact & Breakage Analysis — added `apps/server/scripts/backfill-pending-notifications.ts` as second caller of `notification.service.ts` (calls `notifyStaffOfPendingPackage` at line 76). Also added new row to "Files Modified" table flagging optional `skipPush` flag.

### TODOs injected
- §6 (Callers of notification.service.ts) — `<!-- TODO (audit): decide before execution — add skipPush flag to backfill, skip in non-prod, or accept and document one-time-only constraint -->`
- §1 (Problem Statement) — `<!-- TODO (audit): scope mismatch — Phase 2 only covers package events. Decide whether to narrow §1/§2 wording, keep as aspirational, or expand Phase 2 to cover bookings -->`
- §5 Phase 3 task 3.6 — `<!-- TODO (audit): profile already has handleToggleNotifPref. Decide between dedicated screen, bottom sheet modal, or inline toggles -->`

### Plan content additions (non-TODO)
- §5 Phase 2 task 2.1 — added **Checkpoint** requiring smoke test of `expo-server-sdk` in Cloudflare Workers before continuing to task 2.2

### Deferred
- No execute/log.md → run `/execute` when ready (after resolving the 3 TODOs)

## Next steps
1. Resolve each injected `TODO (audit)` marker in `plan/plan.md`:
   - Decide backfill push-guard strategy
   - Reconcile scope wording in §1/§2
   - Pick UX destination for profile Notifications row
2. Re-run `/audit 05-13_22-30_push-notifications` to confirm clean status
3. Run `/execute` to ship
