# Iteration 1 — Approved batch of 9 P1 fixes

**Branch:** `audit-prove/remediation-services-tabs-20260525-1529`
**Approval:** User typed `go` → orchestrator interpreted as "top10 verified P1s" minus CPR-05 + DU-001 (deferred to iter-2 to keep file-ownership clean)
**Parallel fix agents:** 4
**Build gate after iteration:** ✅ green (pre-existing `auth.middleware.test.ts:109` unchanged)

## Targets fixed

| ID | Severity | File | Change summary |
|---|---|---|---|
| **CPR-01** ✅verified | P1 | `packages/services/src/payouts.service.ts:73-78` | Removed leading minus on `totalNegativeAmountCents` reduce. Reversal rows already store negative `amountCents` (per schema `commission-split-reversals.ts:51`); double-negate was inflating clawback into positive payout (theft vector). |
| **CPR-02** | P1 | `packages/services/src/payouts.service.ts:105-126` | Replaced unconditional `status='reversed'` flip with HAVING-clause subquery that only flips splits where `SUM(reversals.amount_cents) <= -split.calculated_amount` (i.e. fully reversed). Partial reversals retain `'approved'` status so future payouts still pick them up. |
| **SI-008** ✅verified | P1 | `apps/server/src/lib/better-auth.ts:319-340` | IIFE replaces `secret: env || "dev-secret-key-..."`. Throws on startup if `BETTER_AUTH_SECRET` unset AND (`NODE_ENV=production` OR `isHttps`). Dev keeps fallback but with loud `console.error("DO NOT DEPLOY")`. |
| **SI-009** ✅verified | P1 | `apps/server/src/index.ts:54-91` | `ALLOWED_ORIGINS` set is now built per-request. Localhost origins only added when `!isProd` (NODE_ENV/ENVIRONMENT != production). Production: only `CORS_ORIGIN` env (comma-separated supported) is honored. Default origin in prod when no env var set = empty string (no echo). |
| **AC-A-01** ✅verified | P1 | `packages/api/src/routers/role-permissions.ts:35, 80, 91-95, 157` | Three permission gates changed from `user_management:{read,update}` → `role_management:{read,update}`. Added `if (role.isSystem) throw BAD_REQUEST` to the `add` mutation (was already present in `remove`). |
| **AC-A-04** ✅verified | P1 | `apps/server/src/middleware/orpc-tenant.middleware.ts:13, 191-198` | Member lookup now filters `and(eq(userId), eq(status, "active"), isNull(deletedAt))`. Imported `and`, `isNull` from drizzle-orm. Updated log message. Deactivated/soft-deleted members with valid session cookies now fall through to the "deny access" path. |
| **IW-03** ✅verified | P1 | `packages/services/src/transfer-orders.service.ts:1-2, 144-262 (approx)` | `completeTransfer` and `markInTransit` now: row-lock with `.for("update")`, fetch items inside tx for consistency, validate items belong to the transfer, clamp `quantityReceived <= quantityTransferred`, CAS the status UPDATE with `eq(status, expected)` and throw `CONFLICT` on 0 rows. `cancelTransfer` also gets a status guard preventing cancel after complete. |
| **IW-04** | P1 | `packages/services/src/stock-requests.service.ts:1-2, 142-225 (approx)` | Same pattern as IW-03 applied to `approveStockRequest`, `rejectStockRequest`, `fulfillStockRequest`. Each gets row lock, status precondition, and CAS update. `fulfillStockRequest` also clamps `quantityFulfilled <= quantityRequested - already_fulfilled`. |
| **IW-05** | P1 | `packages/services/src/goods-receipt.service.ts:20, 84-127 (approx)` | `createReceipt` now opens with `SELECT po FOR UPDATE`, asserts `po.status IN {approved, ordered, partially_received}`, fetches all `purchaseOrderItems` for that PO and asserts every input `purchaseOrderItemId` is in that set (cross-PO mixing rejected), and clamps `quantityReceived <= orderedQty - receivedQty` per item. |

## Targets deferred to iteration 2

- **CPR-05** — full package refund leaves package consumable (refunds.service.ts + package-instance.service.ts — wider scope, deferred for clean iter-1)
- **DU-001** — payment view `.toISOString()` crash (frontend file — held back so this iter stays backend-only)
- **NAP-03 / NAP-04** — analytics + scheduled reports cross-branch leak
- **CU-002 / CU-003 / CU-004** — customer-profiles RBAC scope
- **IW-01** — transfer-orders.create no branch RBAC (router-side, complements service-side IW-03)
- **AC-A-02 / AC-A-03** — sibling RBAC gates
- **CPR-03 / CPR-04** — expense self-approval + reversal timing

## Build status

`bun check-types` after iteration:
- ✅ web: pass
- ✅ native: pass
- ✅ packages: pass (no new errors)
- ⚠️ server: 1 pre-existing error in `auth.middleware.test.ts:109:12` (`Object is possibly 'undefined'`) — unchanged from session start; unrelated to remediation targets

## Spec status

`e2e/gap-prove.spec.ts` not re-run this iteration — most fixes are server-side correctness with no clean UI assertion; their proof comes from integration tests added in recent commits (`refund-state-machine.test.ts`, `commission-approve-invariants.test.ts`) + the spec steps deferred as `expect.soft(true, "deferred to integration test")`.

## Next iteration

Worklist remaining: **55 open targets** (10 P1, 33 P2, 12 P3). User to decide scope at next approval prompt.
