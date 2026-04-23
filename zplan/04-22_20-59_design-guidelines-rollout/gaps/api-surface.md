# API Surface Audit
**Session:** 04-22_20-59_design-guidelines-rollout
**Findings:** 4 (0 critical · 2 high · 1 medium · 1 info)

## Findings

### [HIGH] Plan's "commissions.bulkApprove" name does not match actual procedure name
**Plan claims:** Phase 5.1 calls `commissions.bulkApprove` mutation for the bulk-approve dialog.
**Actual:** The router key in `baseRouter` is `commissionSplits` (not `commissions`), and the procedure is named `approve` (not `bulkApprove`). The correct call is `client.commissionSplits.approve({ organizationId, ids })`. The procedure exists and is fully implemented (lines 217–263), accepting an array of 1–100 UUIDs and requiring `commission_management:approve` permission.
**File:** `packages/api/src/routers/commission-splits.ts:540-551`, `packages/api/src/routers/index.ts:102`
**Fix:** Update Phase 5.1 dialog to call `client.commissionSplits.approve(...)` instead of `client.commissions.bulkApprove(...)`.

---

### [HIGH] checkIns.create does not exist — correct name is checkIns.recordCheckIn
**Plan claims:** §5.2 references `checkIns.create` for the attendance anti-duplicate warning, and §8.4 references `checkIns.create` in the check-ins router.
**Actual:** The procedure is named `recordCheckIn` (not `create`) in `checkInsRouter`. The correct call is `client.checkIns.recordCheckIn(...)`. There is no `create` alias.
**File:** `packages/api/src/routers/check-ins.ts:32`
**Fix:** Replace all plan and code references to `checkIns.create` with `checkIns.recordCheckIn`.

---

### [MEDIUM] checkIns.recordCheckIn response does not include previousCheckInAt
**Plan claims:** §5.2 option B proposes extending `checkIns.create` response to include `previousCheckInAt` for the anti-duplicate warning UI.
**Actual:** `recordCheckIn` returns a raw `CheckIn` row (the Drizzle `$inferSelect` type). It does NOT include `previousCheckInAt`. When a duplicate is detected (drop-in within 30 min), the service throws an error object with `{ code: "ALREADY_CHECKED_IN", minutesAgo, existingCheckInId }`, which the router converts to an oRPC `CONFLICT` error with `data: { existingCheckInId }`. The `minutesAgo` value is in the error message string but NOT in the structured `data` payload — so the frontend cannot reliably extract it programmatically.
**File:** `packages/api/src/routers/check-ins.ts:103-115`, `packages/services/src/check-ins.service.ts:290-304`
**Fix (Option B):** To surface `previousCheckInAt` on duplicates, either (a) add `minutesAgo` to the CONFLICT error's `data` object in the router, or (b) add a `recentCheckIn` query (plan Option A pre-flight). Option A pre-flight (`checkIns.list` with a 30-min window) is achievable with existing procedures today without any server change.

---

### [INFO] expenses.list({ status }) is fully supported
**Plan claims:** `client.expenses.list({ status: "pending" })` used in claims-widget.
**Actual:** `expenses.list` input schema accepts `status: z.string().optional()` and passes it through to `listExpenses`. No gaps — this call works as-is.
**File:** `packages/api/src/routers/expenses.ts:14-64`
**Fix:** No action required.

---

## Summary

The plan's two biggest API naming errors are: (1) the commission bulk-approve procedure is `client.commissionSplits.approve`, not `client.commissions.bulkApprove` — the procedure fully exists under the correct name; and (2) the check-in procedure is `checkIns.recordCheckIn`, not `checkIns.create`. Neither procedure is missing; both are implemented and registered in `baseRouter`. The only genuine functional gap is that the CONFLICT error thrown on duplicate drop-in check-ins does not expose `minutesAgo` in its structured `data` field, only in the human-readable message string — the frontend will need either a server-side one-liner fix to the error's `data` payload or adopt the pre-flight Option A approach to show the anti-duplicate warning without a server change.
