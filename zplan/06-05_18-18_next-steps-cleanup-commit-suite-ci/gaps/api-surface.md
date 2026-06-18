# API-Surface Audit — `web-holding-it-back-plan.md` Phase 1 (cast removal)

> Auditor: api-surface · Date: 2026-06-06 · Branch: test/unit-suite-green-and-ci-fix
> Scope: verify every oRPC procedure the plan's Phase 1 relies on EXISTS, is registered in the
> router, and returns the fields the plan assumes — so removing `as any`/casts type-checks.

**Counts:** CRITICAL 0 · HIGH 0 · MEDIUM 1 · LOW 1 · INFO 4
**Verdict:** Phase 1 is SOUND. Every cited procedure exists, is wired into `baseRouter`, and the
built `dist/index.d.ts` already carries the fields the plan wants to use. Removing the 5 casts will
type-check. No type-stub rebuild is required for any of them.

---

## Findings

### [INFO] #1 — `commissionSplits.listPendingReview` exists, registered, returns all required fields
- **Plan claims:** review-tab.tsx:425 `r: any` can be replaced by the inferred `.rows` element type with fields `amountCents`, `createdByName`, `staffName`, `roleType`, `trackId`, `note`.
- **Actual:** Procedure defined at `packages/api/src/routers/commission-splits/review.procedures.ts:18`, exported via `commissionSplitsReviewProcedures` → `commission-splits/index.ts` → registered as `commissionSplits: commissionSplitsRouter` in `packages/api/src/routers/base-router.ts:111`. Return type is `ListPendingReviewResult` (`packages/services/src/commission-splits.service.ts:2856`): `{ rows: PendingReviewRow[]; total; nextCursor }`. `PendingReviewRow` (line 2839) carries EXACTLY: `staffName`, `amountCents`, `note`, `createdByName`, `roleType`, `trackId`, plus `id`, `staffId`, `appointmentId`, `salesOrderId`, `createdAt`, `createdByUserId`, `earnedAt`. All six plan-required fields present.
- **File:line:** `apps/web/src/components/pages/commissions/review-tab.tsx:425`
- **Fix:** Type `r` as `(typeof rawRows)[number]` or `Awaited<ReturnType<typeof client.commissionSplits.listPendingReview>>["rows"][number]`. The component remaps service→local shape (`amountCents`→`calculatedAmount`, `note`→`notes`, `createdByName`→`createdBy`); the `?? fallback` remap chains at lines 429-431 must be KEPT (they bridge a naming mismatch, not paper over missing data). Removing only the `: any` annotation is safe.

### [INFO] #2 — `commissionSplits.resolveReview` and `.listLedger` both exist & registered
- **Plan claims:** Both procedures exist (used in Phase 2 invalidation keys + the resolve mutation).
- **Actual:** `resolveReview` at `review.procedures.ts:67` (in `commissionSplitsReviewProcedures`). `listLedger` at `commission-splits/read.procedures.ts:107` (in `commissionSplitsReadProcedures`). Both flow through `commissionSplitsRouter` into `base-router.ts:111`. Confirmed.
- **File:line:** n/a (verification only)
- **Fix:** None.

### [INFO] #3 — `googleCalendar.orgStatus` exists, returns `connectedCount` + `totalTrainerCount`
- **Plan claims:** google-calendar.tsx:134 `orgStatusRaw as any` removable; type exposes `connectedCount`, `totalTrainerCount`.
- **Actual:** Procedure at `packages/api/src/routers/google-calendar.ts:103`. Returns `{ connectedCount: number; totalTrainerCount: number; eventsSyncedToday: null; conflictsDetected: null; lastOrgSyncAt: string | null }`. Built dist confirms (`packages/api/dist/routers/google-calendar.d.ts:220,226` show `connectedCount: number`). `googleCalendar` is a shared (non-server-only) router, so web infers directly — no stub involved.
- **File:line:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/google-calendar.tsx:134`
- **Fix:** Drop `as any`; `orgStatus?.connectedCount` / `?.totalTrainerCount` are typed. The `?? null` / optional-chaining guards already in place can stay.

### [LOW] #4 — google-calendar.tsx:404 cast is `listConnectedCalendars`; returns clean `{ calendars, cachedAt }`
- **Plan claims (line 14):** prompt missed this cast; it is `calendarDataRaw as any`.
- **Actual:** The query is `orpc.googleCalendar.listConnectedCalendars` (`google-calendar.tsx:398-404`). Procedure at `google-calendar.ts:244`. Built dist output type (`google-calendar.d.ts:434`) is a single shape `{ calendars: Awaited<ReturnType<typeof listGoogleCalendars>>; cachedAt: string }` — TS collapsed the cache-hit / fresh-fetch branches since both are identical. So `calendarData.calendars` is fully typed.
- **File:line:** `google-calendar.tsx:404` (and `:405` `const calendars: any[]`)
- **Fix:** Drop `as any` on `calendarData`. The downstream `const calendars: any[] = calendarData?.calendars ?? []` should also be retyped to the real element (`Awaited<ReturnType<typeof listGoogleCalendars>>[number]`), or the `any[]` annotation simply removed to let inference flow. Minor follow-up: confirm the `.calendars` element fields the JSX reads (id/summary/primary) exist on the Google calendar-list type; if a field is absent the JSX — not the cast — would error. Low risk, but check after removal.

### [INFO] #5 — sales `order` query: `salesOrders.getById`; `createdByName` AND `branchId` BOTH on the type (HIGHEST-VALUE finding)
- **Plan claims (T1.2):** casts at sales/$id.tsx:476 (`order as { createdByName? }`) and :621 (`order as { branchId? }`) removable once fields are on the order type; flags risk that a field might be genuinely absent → Phase 1 would fail `bun check-types`.
- **Actual — NO RISK, the casts are redundant:**
  - Query is `orpc.salesOrders.getById` (`sales/$id.tsx:320`). Handler at `packages/api/src/routers/sales-orders.ts:106`, returns `{ ...order, createdByName }` (line 139) where `order = getSalesOrderById(...)` typed `typeof salesOrders.$inferSelect` (`packages/services/src/sales-order.service.ts:152-155`).
  - `createdByName: string | null` is added by the handler spread → on the inferred type.
  - `branchId` is a real column on the schema: `packages/db/src/schema/tenant/sales-orders.ts:44` (`branchId: uuid("branch_id")...`), so it's in `$inferSelect`.
  - **Built dist proves it:** `packages/api/dist/routers/sales-orders.d.ts:150-151` (and :179-180) — the `getById` output literally lists `createdByName: string | null;` and `branchId: string;`. `salesOrders` is registered at `base-router.ts:96`.
- **File:line:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx:476` and `:621`
- **Fix:** Remove both `(order as {...})` casts; use `order.createdByName` and `order.branchId` directly. `bun check-types` WILL pass — no stub edit, no `packages/api` rebuild needed (dist is already current). Note `branchId` is typed `string` (non-null), so the `?? undefined` at :621 becomes dead but harmless; the `order.createdBy` fallback at :477 stays valid (`createdBy` is a separate non-null column). This is the plan's flagged worst-case risk and it resolves GREEN.

### [MEDIUM] #6 — `auth.setPassword` exists but is a SERVER-ONLY router → web type comes from a hand-written stub
- **Plan claims:** set-password.tsx already uses `client.auth.setPassword({ newPassword })`; finding closed, no work.
- **Actual:** Procedure exists at `apps/server/src/routers/auth.ts:528` (exported in the auth router at :574). Because `auth` is a SERVER-only router (not importable by `packages/api`), web type safety depends on the manual stub at `packages/api/src/routers/_types/server-router-types.ts:82` (`setPassword: protectedProcedure`). The stub IS present, so set-password.tsx type-checks today.
- **Caveat for the plan:** the plan correctly leaves set-password untouched, so this is informational. The MEDIUM rating is a heads-up: unlike findings #1–#5 (shared routers where dist auto-tracks the handler), `auth.setPassword`'s web type is only as accurate as the hand-maintained stub. If anyone later changes the procedure's input/output, web won't see it until the stub is edited AND `packages/api` is rebuilt (`project_api_dist_types_rebuild`). No action needed for THIS plan.
- **File:line:** `packages/api/src/routers/_types/server-router-types.ts:82`
- **Fix:** None for this plan. Flagged for awareness only.

---

## Summary

Phase 1 of the plan is **safe to execute as written**. All five cast sites target procedures that
exist, are registered in `base-router.ts`, and already expose the needed fields in the committed
`packages/api/dist` types:

| Cast site | Procedure | Field(s) needed | On the type? | Stub rebuild? |
|---|---|---|---|---|
| review-tab.tsx:425 | `commissionSplits.listPendingReview` | amountCents, createdByName, staffName, roleType, trackId, note | YES (`PendingReviewRow`) | No (shared router) |
| google-calendar.tsx:134 | `googleCalendar.orgStatus` | connectedCount, totalTrainerCount | YES | No |
| google-calendar.tsx:404 | `googleCalendar.listConnectedCalendars` | calendars, cachedAt | YES | No |
| sales/$id.tsx:476 | `salesOrders.getById` | createdByName | YES (handler spread) | No |
| sales/$id.tsx:621 | `salesOrders.getById` | branchId | YES (schema column) | No |

**Highest-value finding (#5):** the plan's flagged worst case — "field genuinely missing → Phase 1
fails `bun check-types`" — does NOT occur. Both `createdByName` and `branchId` are present in the
built `sales-orders.d.ts` (lines 150-151, 179-180). The casts are pure redundancy; removing them
type-checks with zero stub work.

**One nuance to honour:** in `review-tab.tsx` the service row shape differs from the component's
local `PendingReviewRow` (field renames). Keep the `?? fallback` remap chains (lines 429-431) — they
are intentional translation, not defensive papering. Drop only the `: any` annotation, not the remap.

**No type-stub edits and no `packages/api` rebuild are required for Phase 1.** All five fixes are
pure frontend cast removals against already-correct types. The only server-only stub in scope
(`auth.setPassword`, finding #6) is untouched by the plan and already correct.
