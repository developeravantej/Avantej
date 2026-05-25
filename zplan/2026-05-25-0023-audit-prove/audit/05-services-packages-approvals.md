# Domain Services, Packages, Memberships & Approvals

Audit date: 2026-05-25. READ-ONLY. Repo: C:\Project\Avantej.
Scope: services / service-categories / service-members / package-instances /
package-instance-staff / memberships routers + their backing services.

Pages backed: Services (legacy `/dashboard/service/view`), Service Categories,
My Services, Packages (`/dashboard/packages/instances/view`), Memberships
(`/dashboard/memberships/view`), Package Installments tracking, Approvals
(`/dashboard/operations/approvals` — package-purchase approval queue + trainer
assignment).

NOTE on verification: the api package currently has many pre-existing tsc errors
(repo is mid-router-split refactor). All TS errors cited below were confirmed by
`./node_modules/.bin/tsc -b packages/api/tsconfig.json` and are real, not noise.

---

## Endpoints / Procedures

### services (folder) (`packages/api/src/routers/services/`)
Re-export shim: `packages/api/src/routers/services.ts` → `./services/index`.
`index.ts` spreads crud + pricing + analytics procedures.

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenant (read; clients exempt from perm) | List services, branch-scoped | `listServices` |
| `getById` | tenant (read) | Fetch one service + branch guard | `getServiceById` |
| `create` | tenant (service_management:create) | Create service; validates installment plan codes | `createService` + `validateInstallmentPlanCodes` |
| `update` | tenant (service_management:update) | Update service | `updateService` + `validateInstallmentPlanCodes` |
| `duplicate` | tenant (service_management:create) | Clone service (name " (Copy)", isActive:false) | `duplicateService` |
| `resolvePrice` | tenant (no perm gate) | Resolve effective price cents | `resolveServicePrice` |
| `listPriceOverrides` | tenant (read; clients exempt) | List branch price rows | `listServicePriceOverrides` |
| `setBranchPrice` | tenant (update) | Upsert branch/customer price | `setServicePrice` |
| `expireBranchPrice` | tenant (update) | Soft-expire a price override | `expireServicePrice` |
| `deleteBranchPrice` | tenant (delete) | Hard-delete a price override | `deleteServicePrice` |
| `revenueShareByCategory` | tenant (read) | Revenue share by category (≤365d) | `revenueShareByCategory` |
| `avgSessionsSoldPerMonth` | tenant (read; clients exempt) | Avg sessions/mo for a service | `avgSessionsSoldPerMonth` |
| `listWithTrainerTiers` | tenant (read; clients exempt) | Services + eligible trainer tiers | `listServicesWithTrainerTiers` |

`installment-plan-validation.ts` → `validateInstallmentPlanCodes()` (router-local helper). `schemas.ts` → zod enums only.
NOTE: `resolveServicePrice`/`setServicePrice`/`expireServicePrice`/`deleteServicePrice`/`listServicePriceOverrides` live in `pricing.service.ts` (NOT in this domain's owned service files) — pricing logic file is out of owned scope but procedures are listed for completeness.

### service-categories (`packages/api/src/routers/service-categories.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenant (read; clients exempt) | List categories, branch-scoped | `listServiceCategories` |
| `getById` | tenant (read; clients exempt) | Fetch one category | `getServiceCategoryById` |
| `create` | tenant (create) | Create category | `createServiceCategory` |
| `update` | tenant (update) | Update category | `updateServiceCategory` |
No `delete` (see Gaps P3).

### service-category-config (`packages/api/src/routers/service-category-config.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `upsert` | tenant (create OR update) | Upsert booking/cancellation/buffer rules per category | inline (ON CONFLICT) |
| `getByCategoryId` | tenant (read) | Fetch config row or null | inline |

### service-members (`packages/api/src/routers/service-members.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `listMine` | tenant (no perm gate; self) | Member's assigned services + buffer overrides | inline |
| `updateMyBuffer` | tenant (no perm; self, asserts assignment) | Set/clear own per-service buffer | inline upsert/delete |
| `listForMember` | tenant (user_management OR service_management:**update**) | **DOC SAYS "list services for member" but BODY DOES AN INSERT** (see P1) | inline (broken) |
| `remove` | tenant (update) | Remove member from service — **body references undefined `input.bufferTimeMinutes`** (see P1) | inline (broken) |
| `listForService` | tenant (user/service/appointment:read) | List members on a service + displayName | inline |

### category-buffer-overrides (`packages/api/src/routers/category-buffer-overrides.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `listForMember` | tenant (user/service:read) | List a member's category buffer overrides | `listCategoryBufferOverridesForMember` |
| `upsert` | tenant (user/service:update) | Upsert category buffer override for a member | `upsertCategoryBufferOverride` |
| `listMine` | tenant (no perm; self) | Calling member's category overrides | `listCategoryBufferOverridesForMember` |
| `updateMine` | tenant (no perm; asserts has services in category) | Self upsert category override | `upsertCategoryBufferOverride` |

### package-instances (folder) (`packages/api/src/routers/package-instances/`)
Re-export shim: `packages/api/src/routers/package-instances.ts` → `./package-instances/index`. `index.ts` spreads client + create + lists + pending + assign + approve + bulk-reject + lifecycle + history.

| Name | File | Auth | Purpose | Logic fn |
|------|------|------|---------|----------|
| `listForClient` | client | tenant (session client) | Client's own packages | `listPackageInstancesForClient` |
| `getActiveForClient` | client | tenant (session client) | First active package for client | `listPackageInstancesForClient` |
| `getById` | client | tenant (client-owner OR staff read) | One package + trainer-name enrichment | `getPackageInstanceById` |
| `create` | create | tenant (service_management:create) | Create instance; approval gate → pending; installment schedule; notifies staff | `createPackageInstance` + `createInstallmentSchedule` + `getSetting` + `notifyStaffOfPendingPackage` |
| `listMemberships` | lists | tenant (service_management:read) | Retention/memberships grid | `listMemberships` |
| `listExpiring` | lists | tenant (reports:read) | Expiring within 7/30d | `listExpiringMemberships` |
| `listAll` | lists | tenant (service_management:read) | All instances + clientName | inline select |
| `listAssignedToMe` | lists | tenant (no perm; self trainer) | Trainer's assigned packages (cursor) | `listAssignedToMember` |
| `listPending` | pending | tenant (admin/trainer only) | Approval queue (pending+purchased), branch-scoped, enriched | inline select |
| `assignTrainer` | assign | tenant (admin OR trainer self) | Pattern C: assign trainer → active | inline tx — **BROKEN (P1)** |
| `bulkAssign` | assign | tenant (service_management:create) | Bulk-create assigned packages for customers | inline tx — **BROKEN (P1)** |
| `bulkApprove` | approve | tenant (admin OR trainer self) | Bulk pending→active assign | inline tx |
| `reject` | approve | tenant (admin only) | pending→cancelled + notify | inline tx |
| `bulkReject` | bulk-reject | tenant (admin only) | Bulk pending→cancelled | inline tx |
| `cancel` | lifecycle | tenant (package_management:update) | Cancel instance (CONFLICT if already) | `cancelPackageInstance` |
| `freeze` | lifecycle | tenant (package_management:update) | active→frozen | `freezePackageInstance` |
| `unfreeze` | lifecycle | tenant (package_management:update) | frozen→active | `unfreezePackageInstance` |
| `extend` | lifecycle | tenant (package_management:update) | +N days expiry | `extendPackageInstance` |
| `statusHistory` | history | tenant (package_management:read) | Cursor-paged status log | `getPackageInstanceStatusHistory` |

### package-instance-staff (`packages/api/src/routers/package-instance-staff.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenant (package_management:read) | Staff slots for an instance | `listPackageInstanceStaff` |
| `assign` | tenant (package_management:update) | Upsert staff slot | `assignPackageInstanceStaff` |
| `remove` | tenant (package_management:update) | Remove staff by staffId | `removePackageInstanceStaff` |
| `replace` | tenant (package_management:update) | Replace all slots atomically | `replacePackageInstanceStaff` |

### memberships (`packages/api/src/routers/memberships.ts`)
Front-desk freeze/resume of holds. Permission: `customer_management`.
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `freeze` | tenant (customer_management:update) | Create hold + flip pkg→`paused` | `freezeMembership` |
| `resume` | tenant (customer_management:update) | Resume hold → pkg `active` | `resumeMembership` |
| `cancel` | tenant (customer_management:update) | Cancel a freeze (no pkg flip) | `cancelMembershipHold` |
| `listHolds` | tenant (customer_management:read) | Audit-trail of holds | `listHoldsForPackage` |

---

## Logic Functions

### service.service.ts
- `listServices()` — list + category names + 90d avg/mo, branch-filter
- `getServiceById()` — single fetch
- `createService()` — insert
- `revenueShareByCategory()` — revenue share by category (confirmed/completed orders)
- `avgSessionsSoldPerMonth()` — rolling avg sessions sold
- `listServicesWithTrainerTiers()` — services + eligible tier names
- `duplicateService()` — clone
- `updateService()` — partial update
- (No `deleteService` — see P3.)

### service-category.service.ts
- `listServiceCategories()` — list, branch-filter
- `getServiceCategoryById()` — single fetch
- `createServiceCategory()` — insert
- `updateServiceCategory()` — partial update
- (No delete; no `deactivate` helper — soft-delete is via `update(isActive:false)`.)

### package-instance.service.ts
- `listPackageInstancesForClient()` — client list
- `getPackageInstanceById()` — single fetch
- `createPackageInstance()` — insert (supports clientId XOR walkInCustomerId)
- `listMemberships()` — retention grid (raw SQL, outstanding-balance via installments)
- `updatePackageInstance()` — **ORPHAN**: not called by any router/server handler in repo source (only re-exported + present in built dist). Status-history-aware generic updater with no live caller.
- `getPackageInstanceStatusHistory()` — status log query
- `listAssignedToMember()` — trainer's assigned packages
- `cancelPackageInstance()` — tx cancel + history + audit
- `freezePackageInstance()` — tx active→frozen + history + audit
- `unfreezePackageInstance()` — tx frozen→active + history + audit
- `extendPackageInstance()` — tx +N days + history + audit
- `markCompleteIfFinal()` — auto-complete when installmentsPaid≥total AND creditsRemaining≤0. Callers: check-ins.service, installment.service. Active.

### package-instance-staff.service.ts
- `listPackageInstanceStaff()` — list slots
- `assignPackageInstanceStaff()` — upsert one slot
- `removePackageInstanceStaff()` — delete by staffId
- `replacePackageInstanceStaff()` — replace-all in tx

### membership.service.ts (singular — freeze/resume write-side)
- `freezeMembership()` — tx: insert hold + flip pkg→**`paused`** + history (see P1 status-vocab)
- `resumeMembership()` — tx: hold→completed + pkg→active + history
- `cancelMembershipHold()` — mark hold cancelled; does NOT touch pkg status
- `listHoldsForPackage()` — list holds for a pkg
- `listExpiredActiveHolds()` — cron helper (expired+active holds)
- `runAutoResumeHolds()` — cron pass; per-hold tx isolation. **Wired into a cron handler that is never dispatched (see P2).**

### memberships.service.ts (plural — read-side widgets)
- `listExpiringMemberships()` — expiring within 7/30d for dashboard widget

---

## Gaps (prioritized)

### P1 — `bulkAssign` handler is broken: 3 references to undefined `trainerMember` + missing `inArray` import  (packages/api/src/routers/package-instances/assign.procedures.ts:276, 313-316)  [partial | testable:true]
The `bulkAssign` handler takes `trainerMemberId` (optional input) but NEVER resolves it to a member row. It then references a variable `trainerMember` at lines 313, 314, 315, 316 that does not exist in scope — confirmed TS2304 "Cannot find name 'trainerMember'" at all four lines. It also uses `inArray` at line 273-276 but the file only imports `eq` (TS2304 "Cannot find name 'inArray'" at :276). Result: the procedure cannot compile and would throw at runtime — bulk-assigning a service to multiple customers is non-functional.
`persistence:` intended `{ tenant, table: package_instances, where: per customerId, expect: new row source='assigned', status='active', assignedTrainerId/preferredTrainerId from trainerMember, paymentStatus='paid' }` — but the trainer columns are populated from an undefined variable, so even if compiled they would be wrong.

### P1 — `assignTrainer` side-effect references unimported `user` table  (packages/api/src/routers/package-instances/assign.procedures.ts:183-185)  [partial | testable:true]
The post-tx side-effect resolves the trainer's display name via `controlPanelDb.select({ name: user.name }).from(user).where(eq(user.id, trainerMember.userId))`, but `user` (from `@avantej-core/db/schema/auth`) is never imported in this file (only `members` is). Confirmed TS2304 "Cannot find name 'user'" at :183, :184, :185. The main transaction (status→active, staff slot, audit, status-history) is correct, but the file does not compile, so the entire `assignTrainer` procedure — the core Approvals-page "assign trainer = approve" action — is broken. Compare with `client.procedures.ts`/`approve.procedures.ts` which correctly import `user`.
`persistence:` `{ tenant, table: package_instances, where: id=packageInstanceId, expect: status='active', assignedTrainerId, approvedAt/approvedBy set }` + side-table `{ table: package_instance_staff, where: packageInstanceId, slotIndex:0, expect: staffId=trainer.userId }` + `{ table: package_instance_status_history, expect: pending→active row }`. Logic is correct; only the name-enrichment import is missing.

### P1 — service-members `listForMember` does an INSERT and `remove` reads a non-existent input field — `assign`/`updateBuffer` procedures appear lost in a refactor  (packages/api/src/routers/service-members.ts:149-186, 238-268)  [partial | testable:true]
`listForMember` is documented (and listed in api-overview line 466) as "List services for a specific member (admin view)", and its input schema is `{ organizationId, memberId }`. But its body does `insert(serviceMembers).values({ memberId, serviceId: input.serviceId, ... }).onConflictDoNothing()` and returns `{ success: true }` — i.e. it is actually an *assign* operation, and it reads `input.serviceId` which is NOT in its schema. Confirmed TS2339 "Property 'serviceId' does not exist" at :180.
`remove` (input `{ organizationId, memberId, serviceId }`) reads `input.bufferTimeMinutes` at :238, :255, :261 — not in its schema. Confirmed TS2339 at all three lines.
api-overview (lines 462-471) lists `assign` and `updateBuffer` procedures that DO NOT EXIST as keys in `serviceMembersRouter`. This strongly indicates a merge/rename mistake: the `assign` procedure's body got pasted into `listForMember`, and `updateBuffer`'s body got pasted into `remove`, while the original `listForMember`/`remove` logic was dropped. Net effect: real `listForMember` (read) is missing, real `remove` (delete) is broken, and `assign`/`updateBuffer` (documented) are absent. The My Services / service-staff-assignment admin flow is non-functional for list+remove.
`persistence:` `assign` intends `{ tenant, table: service_members, expect: row (memberId, serviceId, isPrimary:false) }`; `updateBuffer`/`remove` intend `{ tenant, table: member_service_buffer_overrides, where: (memberId, serviceId), expect: upsert or delete }`.

### P1 — Membership freeze writes an invalid status value `'paused'`  (packages/services/src/membership.service.ts:105, 79-83, 174-179)  [partial | testable:true]
`freezeMembership` sets `package_instances.status = 'paused'`. The package-instances status vocabulary (db schema `package-instances.ts:62` comment + router `schemas.ts:11-19`) is `pending | active | frozen | completed | exhausted | expired | cancelled` — `'paused'` is NOT a member. `text` column so DB will accept it, but every status-keyed query and the zod `statusSchema` will treat such a row as out-of-band (e.g. `listAll`/`listForClient` filtered by `status` will never match it; the Packages grid won't categorise it). `resumeMembership` reverts to `'active'`, so a resumed package recovers, but a still-frozen membership sits in an unrecognised state.
This also diverges from the OTHER freeze path (`lifecycle.freeze` → `freezePackageInstance`) which uses `'frozen'`. Two freeze mechanisms with two different target statuses for the same column.
`persistence:` `{ tenant, table: package_instances, where: id=packageInstanceId, expect: status SHOULD be 'frozen' (a valid enum) but is written 'paused' }` + side-table `{ table: membership_holds, expect: status='active' row }`.

### P2 — `listMemberships` "frozen" filter keys off `is_locked` but NO freeze path sets `isLocked`  (packages/services/src/package-instance.service.ts:246-247; freeze paths at membership.service.ts:103-106 and package-instance.service.ts:703-710)  [partial | testable:true]
The memberships grid "frozen" filter predicate is `pi.is_locked = TRUE`. Neither `freezeMembership` (sets status='paused') nor `freezePackageInstance` (sets status='frozen', frozenUntil) ever sets `is_locked = true`. `is_locked` is set only by the installment-overdue lock path (installment.service.ts). Consequence: a membership frozen via either UI freeze flow will NOT appear under the "frozen" filter on `/dashboard/memberships/view`. The filter and the freeze writes are semantically disconnected.
`persistence:` filter expects `{ table: package_instances, where: is_locked=true }`; freeze writes only `status` (+ `frozen_until`), never `is_locked`.

### P2 — auto-resume-holds cron handler is never dispatched (frozen memberships never auto-resume)  (apps/server/src/cron/auto-resume-holds.ts:44-49; apps/server/src/index.ts:355-455)  [partial | testable:false]
`runAutoResumeHoldsForTenant` / `runAutoResumeHolds` exist and are correct, and the file's own header documents that "No project-wide cron runner exists today … wire `runAutoResumeHoldsHandler(env)` into the worker's scheduled export." The `scheduled` dispatcher in `apps/server/src/index.ts` handles crons `0 * * * *`, `0 9 * * *`, `30 2 * * *`, `0 3 * * *`, `0 1 * * *`, `0 2 * * *` — none of them invoke auto-resume-holds, and there is no matching cron string in `wrangler.jsonc`. A hold whose `end_date` passes will stay `status='active'` on `membership_holds` and the package stays frozen (`'paused'`) indefinitely unless a front-desk user manually calls `memberships.resume`. Missing automation.
`persistence:` cron would update `{ table: membership_holds, where: status='active' AND end_date<=NOW(), set status='completed', resumedAt }` + `{ table: package_instances, set status='active' }` — never runs.

### P2 — No expiry sweep for non-installment packages (status stays `active` after `expiresAt` passes)  (packages/services/src/package-instance.service.ts — no fn; installment.service.ts:467-492 only)  [missing | testable:false]
The only path that flips a package to `'expired'` is `installment.service.ts evaluateAndLockIfOverdue` (installment-overdue evaluation), driven by the daily installment sweep (`0 2 * * *`). A normal (non-installment) package that simply reaches `expiresAt` is never transitioned to `'expired'` — its stored `status` remains `'active'`. The memberships read queries paper over this (`expired` filter = `status='expired' OR expires_at < NOW()`; `active` filter = `status='active' AND expires_at > NOW()`), but anything keying purely off stored `status` (e.g. `listAll`, `listForClient`, client app "active packages") will keep returning a logically-expired package as active, and credits remain spendable until check-in logic intervenes. No background expiry job exists.
`persistence:` desired `{ table: package_instances, where: status='active' AND expires_at < NOW(), set status='expired' }` — no such sweep.

### P2 — `cancelMembershipHold` cancels the hold but never un-pauses the package  (packages/services/src/membership.service.ts:194-216; router memberships.cancel)  [partial | testable:true]
`cancel` is documented "Cancel an erroneous freeze without flipping the package back automatically." The hold flips to `cancelled`, but `package_instances.status` stays `'paused'` (the invalid value from P1). The function's own comment says "caller should additionally append a status_history row if they reverted package_instances.status separately" — but the router (`memberships.ts:138-161`) does NOT revert the package status. So cancelling an erroneous freeze leaves the package stuck in `'paused'` with no active hold and no follow-up, requiring a manual `resume` against a now-cancelled hold (which will fail — `resumeMembership` requires hold status='active'). Lifecycle dead-end: a `paused` package whose only hold was cancelled cannot be returned to `active` through any membership procedure.
`persistence:` `{ table: membership_holds, set status='cancelled' }` happens; `{ table: package_instances }` is NOT touched — package orphaned in 'paused'.

### P2 — `reject` / `bulkReject` cancel a package but perform NO refund (acknowledged out-of-scope, but a real gap for paid pending packages)  (packages/api/src/routers/package-instances/approve.procedures.ts:22-24, 76-131; bulk-reject.procedures.ts:74-103)  [partial | testable:true]
Rejecting a pending package sets `status='cancelled'`, writes audit + status-history + customer notification, but the docstring explicitly says "Refund handling is out of scope for v1." A `source='purchased'` pending package can carry `paymentStatus='paid'` and a real `paymentId`/`totalPrice`. On reject there is no refund issued, no `paymentStatus` change, and no link to the refunds domain — the customer paid and the package is cancelled with money retained. Intentional-for-v1 but a genuine money-correctness gap; flagging for the auditor.
`persistence:` reject writes `{ table: package_instances, set status='cancelled', cancellationReason, cancelledBy }`; it does NOT touch `paymentStatus` nor create any refund row.

### P3 — No `delete` / explicit `deactivate` for services or service-categories  (packages/api/src/routers/services/crud.procedures.ts; service-categories.ts)  [missing | testable:false]
Neither router exposes a delete; removal is only via `update(isActive:false)`. `service.service.ts` and `service-category.service.ts` have no delete/deactivate fn. Likely intentional (soft-delete convention via `isActive`), but there is no dedicated "deactivate" procedure, so callers must know to PATCH `isActive`. Distinguish: intentional soft-delete model, but undocumented and undiscoverable.

### P3 — api-overview discrepancies  (zhub/shared/api-overview.md:462-471, 311-314)  [n/a | testable:false]
1. service-members section (lines 462-471) lists `assign` and `updateBuffer` procedures that do not exist as router keys, and describes `listForMember`/`remove` with behaviours their broken bodies don't match (see P1). Overview is stale/ahead of the broken code.
2. `bulkAssign` (line 313) is described "Bulk assign trainers to pending packages", but the actual handler bulk-CREATES new `source='assigned'` package_instances for a list of customers — it does not operate on existing pending packages and is about customer assignment, not trainer assignment. Semantic mismatch (compounds P1, since the handler is also broken).

### P3 — `create` notify failure swallowed; `assignTrainer`/`reject` side-effects swallowed (by design)  (create.procedures.ts:150-161; assign.procedures.ts:178-200; approve.procedures.ts:115-128)  [implemented | testable:false]
`notifyStaffOfPendingPackage`, `notifyCustomerPackageAssigned`, `notifyCustomerPackageRejected`, and `clearPendingReviewNotifications` are wrapped in try/catch that only `console.error`s. Intentional (non-critical), correctly post-tx. Noted so the auditor doesn't treat a missing notification as a hard failure. Not a bug.

---

## Cross-cutting notes
- Lifecycle status machine (lifecycle + approve + create): `pending → active` (assign/bulkApprove), `pending → cancelled` (reject/bulkReject), `active → frozen → active` (freeze/unfreeze), `active|frozen → completed` (markCompleteIfFinal), `* → cancelled` (cancel). `exhausted` is reached only by installment.service. `expired` only by installment.service. The membership-holds path adds an out-of-band `paused` status (P1) that the lifecycle machine does not know about.
- Two parallel freeze systems exist: lifecycle `freeze` (status `frozen`, `frozenUntil`, package_management perm) vs memberships `freeze` (status `paused`, `membership_holds` row, customer_management perm). They are not reconciled; the memberships UI uses the holds path, the packages UI uses the lifecycle path. The "frozen" memberships filter matches neither (P2).
- All procedures correctly call `assertOrgContextMatch`; branch RBAC via `accessibleNodeIds` is consistently enforced in lifecycle/approve/assign/pending.

## testable:true finding count: 7
(P1 bulkAssign, P1 assignTrainer, P1 service-members listForMember/remove, P1 membership 'paused' status, P2 frozen-filter/is_locked mismatch, P2 cancelMembershipHold no un-pause, P2 reject no refund)
