# Domain 03 — Packages, Appointments, Scheduling & Check-ins

Audit of oRPC routers + backing services for package instances, appointments, recurrence, class slots, check-ins, waitlist, trainer availability, preferred times, and membership freeze/resume. All file:line refs are absolute-path-relative to repo root. Findings split into **definitely-broken** (compile/logic errors) and **possibly-intentional**.

---

## Routers & Procedures

### packageInstances (`packages/api/src/routers/package-instances/`, split modules)

| Procedure | Auth | Purpose | Backing service fn |
|---|---|---|---|
| `listForClient` (client.procedures.ts:16) | tenant (session user) | Client's own package instances | `listPackageInstancesForClient` |
| `getActiveForClient` (client.procedures.ts:46) | tenant (session user) | First active package for client | `listPackageInstancesForClient` |
| `getById` (client.procedures.ts:71) | tenant; staff→`service_management:read` | One instance + trainer-name enrichment | `getPackageInstanceById` |
| `create` (create.procedures.ts:18) | tenant; `service_management:create` | Create instance (+ installment schedule, approval gate) | `createPackageInstance`, `createInstallmentSchedule`, `getSetting`, `notifyStaffOfPendingPackage` |
| `listMemberships` (lists.procedures.ts:29) | tenant; `service_management:read` | Retention/membership view, RBAC-scoped | `listMemberships` |
| `listExpiring` (lists.procedures.ts:77) | tenant; `reports:read` | Expiring memberships widget | `listExpiringMemberships` (memberships.service.ts) |
| `listAll` (lists.procedures.ts:97) | tenant; `service_management:read` | Raw list + client-name hydration | inline query (no service fn) |
| `listAssignedToMe` (lists.procedures.ts:155) | tenant (any member) | Trainer's assigned packages, cursor-paged | `listAssignedToMember` |
| `listPending` (pending.procedures.ts:22) | tenant; admin/trainer role-gate | Packages awaiting trainer assignment | inline query (no service fn) |
| `assignTrainer` (assign.procedures.ts:33) | tenant; admin/trainer | Assign trainer = approval (pending→active) | inline tx (no service fn) |
| `bulkAssign` (assign.procedures.ts:232) | tenant; `service_management:create` | Bulk-assign service to many customers | inline tx (no service fn) — **BROKEN, see Gaps** |
| `reject` (approve.procedures.ts:25) | tenant; admin only | Reject pending package (→cancelled) | inline tx (no service fn) |
| `bulkApprove` (approve.procedures.ts:144) | tenant; admin/trainer | Bulk approve/assign | inline tx |
| `bulkReject` (bulk-reject.procedures.ts:17) | tenant; admin only | Bulk reject pending | inline tx |
| `cancel` (lifecycle.procedures.ts:22) | tenant; `package_management:update` | Cancel instance | `cancelPackageInstance` |
| `freeze` (lifecycle.procedures.ts:85) | tenant; `package_management:update` | Freeze active instance (→`frozen`) | `freezePackageInstance` |
| `unfreeze` (lifecycle.procedures.ts:146) | tenant; `package_management:update` | Unfreeze (→active) | `unfreezePackageInstance` |
| `extend` (lifecycle.procedures.ts:206) | tenant; `package_management:update` | Extend expiresAt | `extendPackageInstance` |
| `statusHistory` (history.procedures.ts:11) | tenant; `package_management:read` | Cursor-paged status history | `getPackageInstanceStatusHistory` — **BROKEN import, see Gaps** |

### packageInstanceStaff (`package-instance-staff.ts`)

| Procedure | Auth | Purpose | Backing service fn |
|---|---|---|---|
| `list` (:29) | tenant; `package_management:read` | Staff slots for an instance | `listPackageInstanceStaff` |
| `assign` (:51) | tenant; `package_management:update` | UPSERT staff to slot | `assignPackageInstanceStaff` |
| `remove` (:91) | tenant; `package_management:update` | Remove staff by staffId | `removePackageInstanceStaff` |
| `replace` (:120) | tenant; `package_management:update` | Replace all slots atomically | `replacePackageInstanceStaff` |

### appointments (`packages/api/src/routers/appointments/`)

| Procedure | Auth | Purpose | Backing service fn |
|---|---|---|---|
| `list` (list.procedures.ts:31) | tenant; `appointment_management:read` | Recurrence-aware list + name hydration | `listAppointmentsWithRecurrence`, `isVirtualId` |
| `listForUser` (list.procedures.ts:180) | tenant (session user) | Client's appointments | `listAppointmentsForUser` |
| `getById` (list.procedures.ts:214) | tenant; staff→`appointment_management:read` | One appointment | `getAppointmentById` |
| `statusHistory` (list.procedures.ts:251) | tenant; `appointment_management:read` | Cursor-paged status history | `getAppointmentStatusHistory` |
| `create` (crud.procedures.ts:20) | tenant; client self-book OR `appointment_management:create` | Create appt (+credits, buffer, recurrence, GCal) | `createAppointment`, `syncAppointmentToGoogleCalendar` |
| `update` (crud.procedures.ts:148) | tenant; staff `appointment_management:update` or client-cancel | Update appt (+commission, GCal) | `updateAppointment` — **BROKEN import, see Gaps** |
| `materializeOccurrence` (recurrence.procedures.ts:16) | tenant; `appointment_management:create` | Make virtual occurrence into a real child row | inline insert (no service fn) |
| `splitSeries` (recurrence.procedures.ts:109) | tenant; `appointment_management:create` | Split a recurring series at a date | inline tx |
| `cancelSeries` (series-cancel.procedures.ts:11) | tenant; `appointment_management:create` | Cancel parent + all children | inline tx |
| `cancelFuture` (series-cancel.procedures.ts:60) | tenant; `appointment_management:create` | Cancel occurrences from a date onward | inline tx |

### class-slots (`packages/api/src/routers/class-slots/`)

| Procedure | Auth | Purpose | Backing service fn |
|---|---|---|---|
| `list` (read.procedures.ts:16) | tenant; client OR `class_slot_management:read` | List slots + waitlist count + price | `listClassSlots` |
| `getById` (read.procedures.ts:56) | tenant; client OR `class_slot_management:read` | One slot | `getClassSlotById` |
| `bookingCounts` (read.procedures.ts:83) | tenant; `class_slot_management:read` | Slot booking counts in range | `getBookingCounts` |
| `getSignups` (read.procedures.ts:111) | tenant; `class_slot_management:read` | Enrolled clients (+ walk-ins) | `listClassSlotSignups`, `getClassSlotById` |
| `create` (crud.procedures.ts:10) | tenant; `class_slot_management:create` | Create slot | `createClassSlot` |
| `update` (crud.procedures.ts:45) | tenant; `class_slot_management:update` | Update slot (capacity recompute) | `updateClassSlot` |
| `cancel` (crud.procedures.ts:76) | tenant; `class_slot_management:update` | Cancel slot | `cancelClassSlot` |
| `enrollClient` (enrollment.procedures.ts:12) | tenant; `class_slot_management:update` | Enroll client → creates appt + appointmentClient + bumps spots | inline tx (no service fn) |
| `cancelEnrollment` (enrollment.procedures.ts:109) | tenant; `class_slot_management:update` | Cancel enrollment → cancel appt + decrement spots | inline tx |

### check-ins (`check-ins.ts`)

| Procedure | Auth | Purpose | Backing service fn |
|---|---|---|---|
| `recordCheckIn` (:32) | tenant; `attendance_management:create` | Record attendance/drop-in | `recordCheckIn` |
| `listTodaysBookings` (:104) | tenant; `attendance_management:read` | Today's bookings + check-in status | `listTodaysBookings` |
| `list` (:133) | tenant; `attendance_management:read` | Filtered check-in list | `listCheckIns` |
| `recordBulkCheckIn` (:185) | tenant; `attendance_management:create` | Bulk booking check-in | `recordBulkCheckIn` |
| `getActivePackageForMember` (:214) | tenant; `attendance_management:read` | Earliest-expiring active package | inline query |
| `deleteCheckIn` (:254) | tenant; `attendance_management:delete` | Hard-delete + revert credits/attendance | `deleteCheckIn` |

### waitlist (`waitlist.ts`)

| Procedure | Auth | Purpose | Backing service fn |
|---|---|---|---|
| `list` (:13) | tenant; `appointment_management:read` | Waitlist entries | `listWaitlistEntries` |
| `add` (:35) | tenant; `appointment_management:create` | Join waitlist (slot must be full) | `addToWaitlist` |
| `remove` (:64) | tenant; `appointment_management:update` | Cancel entry | `removeFromWaitlist` |
| `promote` (:82) | tenant; `appointment_management:update` | Promote earliest waiting entry | `promoteFromWaitlist` — **incomplete, see Gaps** |

### trainer-availability (`trainer-availability.ts`)

| Procedure | Auth | Purpose | Backing service fn |
|---|---|---|---|
| `list` (:35) | tenant (org-match only) | Recurring slots for a trainer | `listTrainerAvailability` |
| `listByBranch` (:48) | tenant (org-match only) | Trainers + slots, by branch | `listTrainerAvailabilityByBranch` |
| `getComputedSlots` (:69) | tenant (org-match only) | Free windows over a date range | `computeAvailableSlots` |
| `upsert` (:91) | tenant; `appointment_management:update` | Replace-all weekly slots | `upsertTrainerAvailability` |
| `delete` (:134) | tenant; `appointment_management:update` | Delete one slot | `deleteTrainerAvailabilitySlot` |
| `getUtilisation` (:153) | tenant (org-match only) | Per-trainer weekly utilisation | `getTrainerUtilisation` |
| `create` (:173) | tenant; `appointment_management:update` | Create single slot | `createTrainerAvailability` |
| `update` (:210) | tenant; `appointment_management:update` | Update single slot | `updateTrainerAvailability` |
| `getConflicts` (:246) | tenant (org-match only) | Schedule-conflict report | `getTrainerConflicts` |
| `addException` (:266) | tenant; `appointment_management:update` | Date-specific override | `addTrainerAvailabilityException` |
| `listExceptions` (:306) | tenant (org-match only) | List exceptions | `listTrainerAvailabilityExceptions` |
| `deleteException` (:325) | tenant; `appointment_management:update` | Delete exception | `deleteTrainerAvailabilityException` |

### preferred-times (`preferred-times.ts`)

| Procedure | Auth | Purpose | Backing service fn |
|---|---|---|---|
| `list` (:35) | tenant; client-owns OR any staff | Preferred times for instance | `listPreferredTimes` |
| `upsert` (:69) | tenant; staff `service_management:update` OR client-owns | Replace preferred times (max 4) | `upsertPreferredTimes` |

### memberships (`memberships.ts`) — freeze/resume write-side

| Procedure | Auth | Purpose | Backing service fn |
|---|---|---|---|
| `freeze` (:57) | tenant; `customer_management:update` | Freeze package (→`paused` + hold) | `freezeMembership` |
| `resume` (:106) | tenant; `customer_management:update` | Resume hold (→active) | `resumeMembership` |
| `cancel` (:138) | tenant; `customer_management:update` | Cancel erroneous hold | `cancelMembershipHold` |
| `listHolds` (:164) | tenant; `customer_management:read` | Holds audit trail | `listHoldsForPackage` |

---

## Service Functions

### package-instance.service.ts
- `listPackageInstancesForClient` (:83) — client's instances by status/source. **Live.**
- `getPackageInstanceById` (:107) — single instance. **Live.**
- `createPackageInstance` (:120) — insert instance. **Live.**
- `listMemberships` (:205) — retention view (raw SQL, cross-DB names). **Live.**
- `updatePackageInstance` (:382) — partial update + status-history. **Live** (installment.service.ts).
- `getPackageInstanceStatusHistory` (:439) — paged history. **Live.**
- `listAssignedToMember` (:505) — trainer's packages. **Live.**
- `cancelPackageInstance` (:610) — cancel + audit. **Live.**
- `freezePackageInstance` (:679) — active→`frozen`. **Live.** (conflicts w/ membership freeze — Gaps)
- `unfreezePackageInstance` (:745) — `frozen`→active. **Live.**
- `extendPackageInstance` (:815) — bump expiresAt. **Live.**
- `markCompleteIfFinal` (:898) — auto-complete when installments paid + credits exhausted. **Live** (check-ins + installment).

### package-instance-staff.service.ts
- `listPackageInstanceStaff` (:41), `assignPackageInstanceStaff` (:57), `removePackageInstanceStaff` (:105), `replacePackageInstanceStaff` (:125) — all **Live**.

### appointment.service.ts
- `resolveMemberIdFromUserId` (:141) — userId→members.id. **Live** (internal + update).
- `listAppointments` (:163) — staff view w/ SQL RBAC. **ORPHAN** — no owned procedure calls it; `list` uses `listAppointmentsWithRecurrence`. (May be used elsewhere; not in this domain's routers.)
- `listAppointmentsForUser` (:222) — client view. **Live.**
- `getAppointmentById` (:261) — single. **Live.**
- `createAppointment` (:274) — create + credits + buffer + recurrence + commission-config snapshot. **Live.**
- `updateAppointment` (:474) — update + status machine + credit-restore + commission. **Live.**
- `getAppointmentStatusHistory` (:892) — paged history. **Live.**
- (private) `runAppointmentCommission` (:767) — commission on completion/cancel/no_show.

### recurrence.service.ts
- `makeVirtualId` (:41), `isVirtualId` (:46), `parseVirtualId` (:54) — virtual-id helpers. `parseVirtualId` **ORPHAN** (not referenced by owned routers/services; `makeVirtualId`/`isVirtualId` are Live).
- `expandRecurrenceRule` (:115) — pure expansion. **Live.**
- `listAppointmentsWithRecurrence` (:279) — merged real+virtual list. **Live.**

### class-slots.service.ts
- `listClassSlots` (:24), `getClassSlotById` (:119), `createClassSlot` (:129), `updateClassSlot` (:158), `cancelClassSlot` (:224), `listClassSlotSignups` (:305), `getBookingCounts` (:357) — **Live**.
- `incrementBooking` (:246) — **ORPHAN** (only referenced by its own test; enrollment.procedures.ts inlines the spots math).
- `decrementBooking` (:276) — **ORPHAN** (same; cancelEnrollment inlines).

### check-ins.service.ts
- `resolveClientDisplayName` (:116) — **ORPHAN** (exported but unused; batch variant used instead). 
- `recordCheckIn` (:251), `listTodaysBookings` (:418), `recordBulkCheckIn` (:577), `listCheckIns` (:695), `deleteCheckIn` (:792) — **Live**.

### waitlist.service.ts
- `listWaitlistEntries` (:9), `addToWaitlist` (:43), `removeFromWaitlist` (:104), `promoteFromWaitlist` (:124) — **Live** (promote is incomplete — Gaps).

### trainer-availability.service.ts
- `listTrainerAvailability` (:55), `upsertTrainerAvailability` (:72), `listTrainerAvailabilityByBranch` (:148), `createTrainerAvailability` (:226), `updateTrainerAvailability` (:252), `deleteTrainerAvailabilitySlot` (:281), `getTrainerUtilisation` (:315), `computeAvailableSlots` (:504), `getTrainerConflicts` (:592), `addTrainerAvailabilityException` (:749), `listTrainerAvailabilityExceptions` (:771), `deleteTrainerAvailabilityException` (:793) — all **Live**.

### preferred-time.service.ts
- `listPreferredTimes` (:38), `upsertPreferredTimes` (:51) — **Live**.

### membership.service.ts (write-side, freeze/resume)
- `freezeMembership` (:62), `resumeMembership` (:132), `cancelMembershipHold` (:194), `listHoldsForPackage` (:221) — **Live**.
- `listExpiredActiveHolds` (:235), `runAutoResumeHolds` (:257) — cron helpers; **Live** via `apps/server/src/cron/auto-resume-holds.ts` (out of owned scope; referenced by docstring :10).

### memberships.service.ts (read-side)
- `listExpiringMemberships` (:28) — **Live** (packageInstances.listExpiring).

### buffer-time.service.ts
- `resolveBufferTime` (:32), `checkAppointmentBufferConflict` (:82) — **Live** (appointment.service.ts).

### utils/appointment-status-machine.ts
- `assertValidTransition` (:10) — **Live** (appointment.service.ts:545).

---

## Gaps (prioritized)

### P0 — Definitely broken (will not compile / will throw at runtime)

1. **`bulkAssign` references undefined `trainerMember` + missing `inArray` import** — `assign.procedures.ts:11` imports only `{ eq }` from drizzle, but line 276 calls `inArray(members.id, ...)` and lines 313–316 read `trainerMember?.id` / `trainerMember ? ...`. `trainerMember` is never declared in the `bulkAssign` handler (it only exists in the sibling `assignTrainer` handler). This file cannot type-check; if it somehow ran, every bulk-assigned instance would silently get `preferredTrainerId=null`/`assignedTrainerId=null` regardless of the `trainerMemberId` input. The `trainerMemberId` input (assign.procedures.ts:239) is also never resolved to a member row. **Definitely broken.**

2. **`packageInstances.statusHistory` missing `requirePermissionOrpc` import** — `history.procedures.ts:7` imports only `assertOrgContextMatch` from `../../guards`, but line 26 calls `requirePermissionOrpc(...)`. `getControlPanelDb` is imported but `requirePermissionOrpc` is not. ReferenceError / type-check failure. **Definitely broken.**

3. **`appointments.update` missing `getAppointmentById` import** — `crud.procedures.ts:1–5` imports `createAppointment`, `updateAppointment`, `syncAppointmentToGoogleCalendar` only, but line 177 calls `getAppointmentById(context.tenantDb, input.id)`. Not imported. **Definitely broken** — the entire `update` procedure (including client self-cancel) throws on first line of the handler body.

> These three are characteristic of the in-flight router-split refactor (commits `219a0ef8…`); they are almost certainly accidental import-trim regressions, not design choices. Recommend a `bun check-types` gate before merge.

### P1 — Status-value mismatch (silent logic dead-zones)

4. **`no_show` (underscore) vs `no-show` (hyphen) for appointments.** The status machine (`appointment-status-machine.ts:3,7`), the appointments Zod schema (`appointments/schemas.ts:9`), the DB column doc (`packages/db/src/schema/tenant/appointments.ts:37`), buffer/utilisation/conflict queries (`trainer-availability.service.ts:377`), and the recurrence/series logic all use **`no-show`** (hyphen). But `appointment.service.ts` keys multiple branches on **`no_show`** (underscore): the staff-reassignment guard (`:613`), commission-on-no_show (`:700–720`), and `runAppointmentCommission`'s attendee-count branch (`:835`). Because a real appointment's status is `no-show`, these `no_show` branches are **dead code** — no-show appointments never trigger commission, and the "block staff change after delivery" guard at :613 does not fire for no-shows. (The check-ins `outcome` field separately and correctly uses `no_show` as its own enum — that is not a bug.) **Definitely a defect**, possibly masked because no-show commission is rarely exercised.

### P1 — Two conflicting package-freeze mechanisms

5. **`freezePackageInstance` (status `frozen`) vs `freezeMembership` (status `paused`) are divergent and uncoordinated.**
   - `package-instance.service.ts:679` sets `status='frozen'` + `frozenUntil`, no hold row.
   - `membership.service.ts:62` sets `status='paused'` + inserts `membership_holds`, no `frozenUntil`.
   - The package status Zod enum (`package-instances/schemas.ts:11–19`) lists `frozen` but **not `paused`** — so a `paused` package cannot be filtered/serialized through any procedure that validates against `statusSchema`, and `listMemberships`' `frozen` filter keys on `is_locked=TRUE` (`package-instance.service.ts:247`), which neither freeze path sets. Net: a membership frozen via `memberships.freeze` lands in `paused`, won't appear in the `frozen` retention filter, and can't be unfrozen via `packageInstances.unfreeze` (which requires `status='frozen'`, `package-instance.service.ts:759`). Only `memberships.resume` / the auto-resume cron can revive it. **Likely a real inconsistency** (two features built independently); at minimum the enum omission of `paused` is a defect.

### P1 — Waitlist promotion is incomplete (no booking created)

6. **`promoteFromWaitlist` does not create an appointment / appointment_client.** `waitlist.service.ts:124–166` only flips the entry to `promoted` and increments `classSlots.spotsBooked/spotsAvailable`. No `appointments`/`appointmentClients` row is created, so the promoted member has a consumed slot seat but **no actual booking** and no check-in target. Contrast `enrollClient` (enrollment.procedures.ts) which does the full insert. Also the slot-counter SQL at :156–159 reads stale columns within the same UPDATE (`spotsBooked + 1` referencing the pre-update value while also recomputing `isFull` from `spotsBooked + 1` and `isAvailable` from `spotsAvailable - 1`) — correct only because all RHS refer to old values, but `isAvailable = (spotsAvailable - 1) > 0` will be wrong if the slot was already full (spotsAvailable could go negative). **Promotion path is functionally incomplete.**

### P2 — Appointment status machine coverage

7. **Status machine terminal-state audit** (`appointment-status-machine.ts`): states = `pending`, `confirmed`, `completed`, `cancelled`, `no-show`. Transitions: `pending→{confirmed,cancelled,no-show}`, `confirmed→{completed,cancelled,no-show}`; `completed`/`cancelled`/`no-show` terminal (no outbound). All states have inbound edges; no orphan states. **Gaps:** (a) no `pending→completed` direct edge (must pass through `confirmed`) — but `class-slots/enrollment.procedures.ts:73` inserts appointments directly as `confirmed`, and POS/other paths may complete from `pending`; an admin "complete a pending appointment" would be rejected by `assertValidTransition`. (b) No re-open path from terminal states, yet `appointment.service.ts:799` comments anticipate "admin status reversions (completed→cancelled→completed)" — the machine forbids `completed→cancelled`, so that reversion scenario the commission idempotency guard defends against **cannot actually occur through `updateAppointment`** (it would throw at :545 first). Possibly-intentional (strict machine) but the commission guard comment is then misleading.

8. **POS deferred-commission delivery handler exists and is wired.** `pos.service.ts:418/431` sets `salesOrderItems.commissionDeferred=true` for service items and defers commission to appointment delivery. The consuming handler is `appointment.service.ts:654–720` (`updateAppointment`), which on `completed`/`cancelled`/`no_show` checks `updated.salesOrderId` for existing `commissionSplits` and calls `runAppointmentCommission` only if none exist. **Handler present.** Caveat: it depends on (a) `appointments.salesOrderId` being populated when the appointment originates from a POS service sale, and (b) the appointment reaching a delivery status — and per finding #4 the `no_show` delivery branch is dead (hyphen/underscore), so a POS-deferred service that ends as `no-show` will **never** have its deferred commission materialized.

### P2 — Package lifecycle

9. **Credit unlock / installment gating** is coherent: `create.procedures.ts:130` sets `creditsUnlocked=0` for installment plans; `createAppointment` checks `creditsTotal - creditsUsed` (not `creditsUnlocked`) at `appointment.service.ts:339` — i.e. booking does **not** actually gate on unlocked credits, only on total-minus-used. So for an installment package, a client could book against credits that haven't been unlocked by payment yet (the `isLocked` guard at :332 is the only installment defense, and it depends on `evaluateAndLockIfOverdue`). **Possibly-intentional** (lock-based rather than unlock-based gating) but worth confirming against the installment-premium plan.

10. **Expiry job:** `markCompleteIfFinal` (auto-complete) exists; expiry-to-`expired` is handled by `evaluateAndExpireIfOverdue` (installment.service.ts, out of scope) invoked inside `createAppointment` (:311) — i.e. expiry is lazily evaluated on booking, not via a dedicated cron in owned files. No dead-end found, but expiry only advances when someone attempts a booking.

11. **`pending` dead-end safety:** booking against a `pending` package is blocked both at router (`crud.procedures.ts:89`) and service (`createAppointment` requires `status==='active'`, :335). Good. A `pending` package with no trainer ever assigned has no auto-expiry/auto-reject in owned code → can sit indefinitely. **Possibly-intentional.**

### P2 — Recurrence materialization edge cases

12. **`expandRecurrenceRule` edge cases** (`recurrence.service.ts`): (a) Monthly `day_of_month` uses JS `setUTCMonth` rollover (Jan 31 → Mar 3) — documented as acceptable (:11), but means a "31st of month" series silently skips/shifts short months. (b) All math is UTC; Malaysia is UTC+8, so a series whose local time-of-day is e.g. 00:30 MYT lands on the wrong UTC calendar day for materialized-child date-matching (`toIsoDateStr` at :354 vs :382), risking a virtual occurrence not de-duping against its materialized child. (c) `MAX_VIRTUAL_OCCURRENCES=500` cap silently truncates long open-ended series. (d) `materializeOccurrence` (recurrence.procedures.ts:52) builds `occurrenceStartTime` via string concat `${datePart}T${parentTime}` — relies on the parent time already being a UTC `Z` string; safe here but brittle. **All possibly-intentional / documented**, flagged for tz follow-up.

### P3 — Minor / dead code

13. `waitlist.ts:11` imports `requirePermission` from `@avantej-core/services` but never uses it. Dead import.
14. `recurrence.procedures.ts:9` and `series-cancel.procedures.ts:5` import `ne`/`gte` — `recurrence.procedures.ts` imports `ne` but does not use it (only `series-cancel` uses `ne`). Minor unused import.
15. `incrementBooking`/`decrementBooking` (class-slots.service.ts:246/276) and `resolveClientDisplayName` (check-ins.service.ts:116) and `parseVirtualId` (recurrence.service.ts:54) are exported but unused by any owned router/service — **ORPHAN** candidates (some have tests, so not removable without test updates).

### Procedures vs services / api-overview discrepancies

16. Several procedures **inline DB logic with no backing service fn**: `packageInstances.listAll`, `.listPending`, `.assignTrainer`, `.bulkAssign`, `.reject`, `.bulkApprove`, `.bulkReject`; `appointments.materializeOccurrence`, `.splitSeries`, `.cancelSeries`, `.cancelFuture`; `class-slots.enrollClient`, `.cancelEnrollment`; `check-ins.getActivePackageForMember`. Not bugs, but they bypass the service layer (harder to unit-test, and duplicate the spots-math that `incrementBooking`/`decrementBooking` already implement — see #15).
17. `zhub/shared/api-overview.md` is **stale** relative to the current router split: it lists `packageInstances` additions of `statusHistory/assignTrainer/reject/listPending` (api-overview.md:24) but does not mention `bulkAssign`, `bulkApprove`, `bulkReject`, `listAssignedTome`, `listExpiring`, `cancel/freeze/unfreeze/extend`, the `packageInstanceStaff` slot semantics, or the `memberships` freeze/resume router. The doc predates Phase-5 lifecycle + freeze work. Recommend `/hub-update`.
