# Iteration 2 — 2026-05-27

## Gate: GREEN (check-types --force: 3 successful, 0 errors)

## Fixes applied this iteration

| Target | Status | Change |
|--------|--------|--------|
| SP-05 | no-op | Commission void already writes per-split audit_logs rows via writeAudit (action=commission.void + salesOrderId). No gap. |
| ST-03 | no-op | runScheduledReports already wired to hourly cron in apps/server/src/index.ts:383 since a prior session. |
| PS-04 | fixed | membership.service.ts:79 — freeze guard extended from `status==="paused"` to `status==="paused" \|\| status==="frozen"`. Prevents lifecycle-frozen package being silently overwritten to paused state. |
| ST-02 | fixed | packages/db/src/schema/tenant/notifications.ts — emailSentAt column added. Migration 0076_notifications_add_email_sent_at.sql. packages/db generated regenerated. apps/server/src/services/notification-dispatch.service.ts (new) — dispatches announcement-type notification emails hourly (per-tenant, per-notification, failure-tolerant). apps/server/src/index.ts — runNotificationEmailDispatch wired into 0 * * * * cron via ctx.waitUntil. |

## Final proof run
All 23 spec steps PASS. No regressions.

## All targets resolved
25 total findings: 23 fixed, 2 no-ops (SP-05, ST-03 already addressed). AC-03 skipped by user request.
