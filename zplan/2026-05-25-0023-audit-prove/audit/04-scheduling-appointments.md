# Domain Scheduling: Appointments, Class Slots, Availability, Attendance

Read-only audit. Repo root `C:\Project\Avantej`. Owned routers + services for the Scheduling domain (Appointments, Class Slots, Trainer Availability, Attendance/Check-ins, Rooms, Preferred Times, Coach Intake, Google Calendar, Waitlist, Buffer/Recurrence/Category-buffer logic).

All scheduling routers are registered in `packages/api/src/routers/base-router.ts` (appointments:80, preferredTimes:83, rooms:93, classSlots:106, waitlist:108, coachIntake:119, trainerAvailability:120, googleCalendar:127, checkIns:130). `appointments.ts` / `class-slots.ts` are re-export shims (Plan D-S7). `waitlist.ts` is in-domain (backs class-slot waitlist) and is audited here.

---

## Endpoints / Procedures

### appointments (`packages/api/src/routers/appointments/`)
Aggregated in `index.ts` from list/crud/recurrence/series-cancel modules.

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (appointment_management:read) | List appts in window, recurrence-expanded, name-enriched, RBAC + post-filters (status/service/branch/scope) | `listAppointmentsWithRecurrence` (recurrence.service) |
| `listForUser` | protected (session user, no perm gate) | Client view of own appts | `listAppointmentsForUser` |
| `getById` | protected (client owner OR appointment_management:read) | Single appt detail | `getAppointmentById` |
| `statusHistory` | protected (appointment_management:read) | Cursor-paginated status transition log, changedBy resolved | `getAppointmentStatusHistory` |
| `create` | protected (appointment_management:create OR client self-book) | Create appt (+ recurrence rule, staff rows, GCal sync) | `createAppointment` + `syncAppointmentToGoogleCalendar` |
| `update` | protected (staff:update OR client cancel-only) | Update status/time/staff; commission on completed/cancelled/no_show; GCal sync | `updateAppointment` + `syncAppointmentToGoogleCalendar` |
| `materializeOccurrence` | protected (appointment_management:create) | Persist a virtual recurrence occurrence as a real row | inline (insert into `appointments`) |
| `splitSeries` | protected (appointment_management:create) | Split a series at a date, re-parent children | inline tx |
| `cancelSeries` | protected (appointment_management:create) | Cancel parent + all non-completed children | inline tx |
| `cancelFuture` | protected (appointment_management:create) | Truncate series + cancel children on/after date | inline tx |

### class-slots (`packages/api/src/routers/class-slots/`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (clients allowed; staff need class_slot_management:read) | List slots w/ waitlist + price | `listClassSlots` |
| `getById` | protected (clients allowed; staff:read) | Single slot | `getClassSlotById` |
| `bookingCounts` | protected (class_slot_management:read) | Booking-count summary for range | `getBookingCounts` |
| `getSignups` | protected (class_slot_management:read) | Attendee list (members + walk-ins) | `listClassSlotSignups` |
| `create` | protected (class_slot_management:create) | Create slot | `createClassSlot` |
| `update` | protected (class_slot_management:update) | Update slot (recomputes capacity flags) | `updateClassSlot` |
| `cancel` | protected (class_slot_management:update) | Mark slot cancelled | `cancelClassSlot` |
| `enrollClient` | protected (class_slot_management:update) | Book a client into a slot (creates appt + appointment_clients, bumps spots) | inline tx |
| `cancelEnrollment` | protected (class_slot_management:update) | Cancel a client's enrollment, free spot | inline tx |

### trainer-availability (`packages/api/src/routers/trainer-availability.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (no perm gate) | List a trainer's recurring slots | `listTrainerAvailability` |
| `listByBranch` | protected (no perm gate) | All active trainers + slots for a branch | `listTrainerAvailabilityByBranch` |
| `getComputedSlots` | protected (no perm gate) | Free windows = recurring − booked appts | `computeAvailableSlots` |
| `upsert` | protected (appointment_management:update) | Replace-all weekly slots | `upsertTrainerAvailability` |
| `delete` | protected (appointment_management:update) | Delete one slot | `deleteTrainerAvailabilitySlot` |
| `getUtilisation` | protected (no perm gate) | Per-trainer availability/booked/util% for a week | `getTrainerUtilisation` |
| `create` | protected (appointment_management:update) | Create one slot | `createTrainerAvailability` |
| `update` | protected (appointment_management:update) | Update one slot | `updateTrainerAvailability` |
| `getConflicts` | protected (no perm gate) | Detect outside-availability/block/timeoff conflicts | `getTrainerConflicts` |
| `addException` | protected (appointment_management:update) | One-off date block/timeoff | `addTrainerAvailabilityException` |
| `listExceptions` | protected (no perm gate) | List exceptions in range | `listTrainerAvailabilityExceptions` |
| `deleteException` | protected (appointment_management:update) | Delete an exception | `deleteTrainerAvailabilityException` |

### rooms (`packages/api/src/routers/rooms.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (appointment_management:read) | List rooms (RBAC filtered) | `listRooms` |
| `getById` | protected (appointment_management:read) | Single room | `getRoomById` |
| `create` | protected (appointment_management:create) | Create room | `createRoom` |
| `update` | protected (appointment_management:update) | Update room | `updateRoom` |
| `delete` | protected (appointment_management:update) | Soft-delete room (isActive=false) | `deleteRoom` |

### preferred-times (`packages/api/src/routers/preferred-times.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (client owner OR any staff) | List preferred times for a package instance | `listPreferredTimes` |
| `upsert` | protected (staff service_management:update OR client owner) | Replace ≤4 preferred times | `upsertPreferredTimes` |

### google-calendar (`packages/api/src/routers/google-calendar.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `status` | protected (no real gate — see P1) | Caller's connection status | inline query |
| `disconnect` | protected (no real gate) | Revoke + delete caller connection | `revokeGoogleToken` + delete |
| `orgStatus` | protected (appointment_management:read) | Org-wide GCal aggregates | inline aggregates |
| `updateSettings` | protected (appointment_management:update) | Update syncDirection/conflictPolicy | inline update |
| `syncNow` | protected (appointment_management:update) | Rate-limited sync signal (bumps updatedAt) | `checkSyncNowRateLimit` |
| `listConnectedCalendars` | protected (appointment_management:read) | Google calendarList w/ 24h cache | `listGoogleCalendars` |

### check-ins (`packages/api/src/routers/check-ins.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `recordCheckIn` | protected (attendance_management:create) | Record member/walk-in check-in | `recordCheckIn` |
| `listTodaysBookings` | protected (attendance_management:read) | Today's bookings + check-in status | `listTodaysBookings` |
| `list` | protected (attendance_management:read) | List check-ins (RBAC) | `listCheckIns` |
| `recordBulkCheckIn` | protected (attendance_management:create) | Bulk check-in ≤100 | `recordBulkCheckIn` |
| `getActivePackageForMember` | protected (attendance_management:read) | Earliest-expiring active package | inline query |
| `deleteCheckIn` | protected (attendance_management:delete) | Delete + revert credits/attended | `deleteCheckIn` |

### coach-intake (`packages/api/src/routers/coach-intake.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `listSlots` | protected (no gate) | Trainer recurring intake slots | `listCoachIntakeSlots` |
| `upsertSlots` | protected (appointment_management:update OR self) | Replace recurring intake slots | `upsertCoachIntakeSlots` |
| `getOpenSlots` | protected (no gate) | Open (unclaimed) slots in range | `computeOpenIntakeSlots` |
| `claimSlot` | protected (appointment_management:update OR self) | Block a slot (insert exception) | `claimIntakeSlot` |
| `unclaimSlot` | protected (no gate beyond login) | Delete an exception | `unclaimIntakeSlot` |
| `listExceptions` | protected (no gate) | Exceptions in range | `listIntakeExceptions` |
| `listByBranch` | protected (no gate) | Coaches + intake slots per branch | `listCoachIntakeByBranch` |

### waitlist (`packages/api/src/routers/waitlist.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (appointment_management:read) | List waitlist entries | `listWaitlistEntries` |
| `add` | protected (appointment_management:create) | Join waitlist (only if slot full) | `addToWaitlist` |
| `remove` | protected (appointment_management:update) | Cancel a waitlist entry | `removeFromWaitlist` |
| `promote` | protected (appointment_management:update) | Promote earliest waiting → bumps slot count | `promoteFromWaitlist` |

---

## Logic Functions

### appointment.service.ts
- `resolveMemberIdFromUserId()` — userId → members.id for staff assignment / buffer checks
- `listAppointments()` — staff list w/ SQL-side RBAC. **Note:** still exported but NOT used by the `list` procedure (which uses `listAppointmentsWithRecurrence`); used by tests/other callers — verify before treating as live
- `listAppointmentsForUser()` — client view list
- `getAppointmentById()` — single fetch
- `createAppointment()` — tx: package lock + credit deduction + buffer check + insert + staff rows + recurrence rule + audit + GCal (caller-side)
- `updateAppointment()` — tx: status machine, credit restore on cancel, staff replace, commission on completed/cancelled/no_show, audit, status history
- `getAppointmentStatusHistory()` — cursor pagination over appointment_status_history
- `runAppointmentCommission()` — private helper (commission generation)

### class-slots.service.ts
- `listClassSlots()` — list + waitlist count + price
- `getClassSlotById()` — single
- `createClassSlot()` — insert
- `updateClassSlot()` — update (recomputes isFull/spotsAvailable on capacity change)
- `cancelClassSlot()` — set isCancelled=true (see P1: no downstream cleanup)
- `incrementBooking()` — bump spots — **ORPHAN** (no caller in domain; enrollment uses inline updates instead)
- `decrementBooking()` — drop spots — **ORPHAN** (same)
- `listClassSlotSignups()` — attendee list w/ walk-in join
- `getBookingCounts()` — count summary

### trainer-availability.service.ts
- `listTrainerAvailability`, `upsertTrainerAvailability`, `listTrainerAvailabilityByBranch`, `createTrainerAvailability`, `updateTrainerAvailability`, `deleteTrainerAvailabilitySlot`, `getTrainerUtilisation`, `computeAvailableSlots`, `getTrainerConflicts`, `addTrainerAvailabilityException`, `listTrainerAvailabilityExceptions`, `deleteTrainerAvailabilityException` — all wired to router (no orphans). Internal helpers: `slotMinutes`, `hhmmToMinutes`, `minutesToHHMM`, `subtractBookings`, `toDateString`, `toHHMM`.

### check-ins.service.ts
- `resolveClientDisplayName()` — single name resolver (used by deleteCheckIn path)
- `batchResolveDisplayNames()` — batch resolver (private)
- `recordCheckIn()` — insert + flip attended + credit increment + audit + markCompleteIfFinal
- `listTodaysBookings()` — today's bookings annotated
- `recordBulkCheckIn()` — loop over recordCheckIn
- `listCheckIns()` — filtered list
- `deleteCheckIn()` — revert attended + credits + delete + audit

### google-calendar.service.ts
- `getGoogleAuthUrl()`, `exchangeCodeForTokens()`, `refreshAccessToken()`, `getGoogleUserInfo()`, `revokeGoogleToken()`, `createCalendarEvent()`, `updateCalendarEvent()`, `deleteCalendarEvent()`, `listGoogleCalendars()`, `checkSyncNowRateLimit()`. `getGoogleAuthUrl`/`exchangeCodeForTokens`/`getGoogleUserInfo` are the OAuth-connect path — **no router procedure in the audited surface initiates connect** (likely a server-only/REST callback route; verify outside this domain).

### google-calendar-sync.service.ts
- `syncAppointmentToGoogleCalendar()` — fan-out create/update/delete to connections; never throws
- private: `ensureValidToken` (decrypt + refresh), `buildCalendarEvent`, `updateSyncStatus`

### waitlist.service.ts
- `listWaitlistEntries()`, `addToWaitlist()`, `removeFromWaitlist()`, `promoteFromWaitlist()` — all wired to waitlistRouter

### buffer-time.service.ts
- `resolveBufferTime()` — staff override → category default → 0
- `checkAppointmentBufferConflict()` — overlap check w/ buffer; both used by appointment.service

### recurrence.service.ts
- `makeVirtualId`, `isVirtualId`, `parseVirtualId`, `expandRecurrenceRule`, `listAppointmentsWithRecurrence` — all used. `parseVirtualId` — only obvious caller is internal/tests; low-risk.

### category-buffer-overrides.service.ts
- `listCategoryBufferOverridesForMember()`, `upsertCategoryBufferOverride()` — backing the `category-buffer-overrides` router (out of owned set but consumed by buffer cascade).

### rooms.service.ts
- `listRooms`, `getRoomById`, `createRoom`, `updateRoom`, `deleteRoom` — all wired

### preferred-time.service.ts
- `listPreferredTimes`, `upsertPreferredTimes` — wired

### coach-intake.service.ts
- `listCoachIntakeSlots`, `upsertCoachIntakeSlots`, `computeOpenIntakeSlots`, `claimIntakeSlot`, `unclaimIntakeSlot`, `listIntakeExceptions`, `listCoachIntakeByBranch` — all wired

---

## Gaps (prioritized)

### P1 — `getAppointmentById` used but never imported in appointments crud `update` (compile/runtime error)  (packages/api/src/routers/appointments/crud.procedures.ts:177)  [status: missing | testable: false]
`update` calls `getAppointmentById(context.tenantDb, input.id)` at line 177, but the import block (lines 1–17) only imports `createAppointment, updateAppointment, syncAppointmentToGoogleCalendar` from `@avantej-core/services`. `getAppointmentById` is exported from services (`packages/services/src/index.ts:39`) and is imported in the sibling `list.procedures.ts`, but NOT here. This is a `ReferenceError`/TS "cannot find name" — every `appointments.update` call (status change, client cancel, staff reassign) will throw before any DB work. This is the single highest-impact finding: the entire appointment update/cancel lifecycle is dead until the import is added. Classified missing+not-testable because the path cannot execute as written (would need the import added before any e2e can pass).
persistence: would write `appointments` (status/time/staff) + `appointment_staff` + `commission_splits` + `appointment_status_history`; currently nothing persists because the handler throws.

### P1 — Class-slot cancellation is a lifecycle dead-end: enrolled clients not cancelled, not refunded, waitlist not notified  (packages/services/src/class-slots.service.ts:224)  [status: partial | testable: true]
`cancelClassSlot` sets `isCancelled=true, isAvailable=false` on `class_slots` only. It does NOT: cancel the enrolled `appointments` (they stay `confirmed`), does NOT reset `appointment_clients`, does NOT refund `pricePaid`, and does NOT notify/clear `waitlist_entries`. After a cancel, `listClassSlotSignups`/`listTodaysBookings`/check-in still treat enrolled clients as live bookings, and the slot's `spotsBooked` is never reset. The room/trainer time is also not freed for those appointments. There is no automation to fan a cancellation out to the booked clients.
persistence: tenant — should cascade to `appointments` (status→cancelled where classSlotId=id), `class_slots.spotsBooked/spotsAvailable`, `waitlist_entries` (status→cancelled or notify), optional refund rows; expect: zero live appointments referencing a cancelled slot. Currently only `class_slots.isCancelled=true` is written.

### P1 — Waitlist promotion never books the client and never frees on enrollment cancel / no automation  (packages/services/src/waitlist.service.ts:124; packages/api/src/routers/class-slots/enrollment.procedures.ts:109)  [status: partial | testable: true]
`promoteFromWaitlist` flips the earliest `waiting` entry to `promoted` and increments `class_slots.spotsBooked/spotsAvailable`, but it creates NO `appointments` row and NO `appointment_clients` row for the promoted member — so a "promoted" person is not actually booked and won't appear in signups/check-in, yet the slot count is consumed (double-jeopardy: capacity is eaten but no booking exists). It also does not notify the member. Separately, `cancelEnrollment` (enrollment.procedures.ts:109) decrements `spotsBooked` when a client drops but never calls `promoteFromWaitlist`, and `cancelClassSlot` doesn't either — so a freed spot never auto-promotes the waitlist. Promotion is manual-only (`waitlist.promote`) and even then is incomplete.
persistence: tenant — promotion should INSERT `appointments` (status confirmed, classSlotId) + `appointments`→`appointment_clients`, and `waitlist_entries.status=promoted`; expect a real booking. Currently only `waitlist_entries.status` + `class_slots` counters change.

### P1 — Google Calendar `disconnect` and `listConnectedCalendars` pass the ENCRYPTED accessToken to Google (token never decrypted)  (packages/api/src/routers/google-calendar.ts:82, 248)  [status: partial | testable: true]
Tokens are stored encrypted (`google-calendar-connections.accessToken` is the encrypted blob; `encryptionKeyId` column; the sync service uses `decryptToken(connection.accessToken)` and `ensureValidToken`). But the router calls `revokeGoogleToken(connection.accessToken)` (line 82) and `listGoogleCalendars(connection.accessToken)` (line 248) with the RAW encrypted value. Result: `listConnectedCalendars` will get a Google 401 and throw `INTERNAL_SERVER_ERROR` (or silently fall back to stale cache); `disconnect`'s revoke is best-effort and silently fails so the Google grant is never actually revoked (only the local row is deleted). Also neither call refreshes an expired token. Inconsistent with the sync path which decrypts correctly.
persistence: `google_calendar_connections` row deleted on disconnect (local cleanup OK); Google-side grant NOT revoked.

### P2 — No appointment reminder / no-show automation; no recurrence materialization job  (packages/services/src/appointment.service.ts; recurrence.service.ts)  [status: missing | testable: false]
No scheduled job exists in the domain to: send booking reminders, auto-flag `no-show` for past `confirmed` appointments, or materialize upcoming virtual recurrence occurrences. `no-show` is only reachable via manual `update`. Virtual occurrences exist only at read-time via `listAppointmentsWithRecurrence`; they must be manually materialized (`materializeOccurrence`) before they can be checked-in or have a status set — there is no batch/cron that does this. `getTrainerConflicts`/`getTrainerUtilisation` ignore `trainer_availability_exceptions` (one-off blocks) entirely — conflicts are computed only against recurring slots.
persistence: n/a (missing automation).

### P2 — Check-in / recordCheckIn does NOT deduct package credit by default; booking flow already deducted, drop-in path can over/under count  (packages/services/src/check-ins.service.ts:357)  [status: partial | testable: true]
`recordCheckIn` only increments `package_instances.creditsUsed` when `creditsConsumed > 0` is explicitly passed (default 0). `createAppointment` already deducts a credit at booking time, so for booking-linked check-ins this is intentional (avoids double-charge). BUT for a **drop-in** that consumes a session, the caller must opt-in to `creditsConsumed`; the attendance UI does not pass it through the `recordCheckIn` procedure unless the operator sets it. `recordBulkCheckIn` always calls with no `creditsConsumed`, so bulk check-in never deducts a credit even for drop-ins. Net: attendance does not reliably deduct package credit — it relies on booking-time deduction, which doesn't exist for drop-ins. Confirm against product intent.
persistence: `check_ins` (always), `appointment_clients.attended` (booking only), `package_instances.creditsUsed` (only if creditsConsumed>0). Drop-in credit deduction effectively missing in bulk path.

### P2 — `assertTenantAndMember` in google-calendar router is an empty no-op assertion  (packages/api/src/routers/google-calendar.ts:19)  [status: partial | testable: false]
The function body (lines 23–25) is empty — it asserts the types but performs NO runtime check that `tenantDb`/`member` exist. `status`/`disconnect`/`syncNow` rely on it before dereferencing `context.member.id`. If `tenantProcedure` middleware guarantees these, it's harmless dead code; if not, a missing member would NPE instead of returning a clean error. Either way it is misleading (looks like a guard, isn't). Compare to other routers which explicitly `if (!context.tenantDb || !context.member) throw`.
persistence: n/a.

### P2 — `appointments.getById` grants cross-branch read to any client who owns the row, bypassing RBAC; client branch scope not checked  (packages/api/src/routers/appointments/list.procedures.ts:236)  [status: partial | testable: true]
For `isClient` (session user == appointment.userId) the handler returns the appointment immediately with NO branch/accessibleNodeIds check. Acceptable for own bookings, but the same procedure for `isStaff` does enforce `guardInputBranchForContext`. Lower risk (owner-only), flagged for completeness. Similarly `listForUser` has no permission gate (by design — own data).
persistence: read-only.

### P2 — Class-slot `enrollClient` does not enforce trainer/room buffer conflict or double-booking for the instructor  (packages/api/src/routers/class-slots/enrollment.procedures.ts:64)  [status: partial | testable: true]
The inline appointment insert sets `trainerId: slot.instructorId` and `type: "semi-private"` but does NOT run `resolveBufferTime`/`checkAppointmentBufferConflict` (unlike `createAppointment`). The instructor could be double-booked across overlapping slots. Capacity is enforced per-slot (`spotsBooked >= capacity`) but not against the trainer's other commitments. Also enrollment sets `paymentStatus: "pending"` and `pricePerClient` from service price but creates no sales/installment linkage and no credit deduction (class enrollments never touch `package_instances`).
persistence: INSERT `appointments` + `appointment_clients`; UPDATE `class_slots` counters. No buffer/commission/credit side-effects.

### P3 — `incrementBooking` / `decrementBooking` are orphaned  (packages/services/src/class-slots.service.ts:246, 276)  [status: partial | testable: false]
Both exported, neither called in the domain (enrollment uses inline `class_slots` updates). Dead code / divergent logic risk: the inline updates and these helpers compute `isAvailable` differently (`newBooked < capacity && !isCancelled` vs `!newIsFull && !isCancelled`).
persistence: n/a (unused).

### P3 — `listAppointments` (service) bypassed by the `list` procedure  (packages/services/src/appointment.service.ts:163)  [status: partial | testable: false]
The `list` procedure uses `listAppointmentsWithRecurrence` exclusively; `listAppointments` (with its SQL-side RBAC) is retained but not used by the audited router. Possible stale/duplicate path — confirm test/other-domain usage before removal.
persistence: read-only.

### P3 — api-overview.md is stale for this domain (multiple procedures undocumented)  (zhub/shared/api-overview.md:131-139, 196-200, 526-531)  [status: implemented | testable: false]
Discrepancies vs. live code:
- `class-slots`: overview omits `enrollClient` and `cancelEnrollment` (both live in `enrollment.procedures.ts`).
- `google-calendar`: overview lists only `disconnect`/`status`; live router also exposes `orgStatus`, `updateSettings`, `syncNow`, `listConnectedCalendars`.
- `trainer-availability`: overview lists only `delete`/`list`/`upsert`; live router also has `listByBranch`, `getComputedSlots`, `getUtilisation`, `create`, `update`, `getConflicts`, `addException`, `listExceptions`, `deleteException`.
- `coach-intake`: entire router (`listSlots`, `upsertSlots`, `getOpenSlots`, `claimSlot`, `unclaimSlot`, `listExceptions`, `listByBranch`) is absent from the overview.
- `waitlist`: overview lists only `list`; live router also has `add`, `remove`, `promote`.
persistence: docs only.

### P3 — Recurrence GCal sync only fires on the series head; materialized/split occurrences not synced  (packages/api/src/routers/appointments/recurrence.procedures.ts:60, 145)  [status: partial | testable: true]
`materializeOccurrence` and `splitSeries` insert rows directly via `tx` and never call `syncAppointmentToGoogleCalendar`, unlike `create`/`update`. A materialized occurrence or split-off series will not appear on a connected Google Calendar.
persistence: INSERT `appointments` (+ `recurrence_rules` on split); no `google_calendar_event_mappings` row created.

---

## Notes on intentional behaviour (not gaps)
- Booking-linked check-ins intentionally skip the 30-min anti-duplicate window (each appointment_client is unique).
- Cancelled appointments intentionally still earn commission (trainer not penalised) — `updateAppointment` cancellation commission branch.
- Credit deduction at booking (not check-in) for package-backed 1:1 appointments is by design; the gap is specifically the drop-in/bulk path (P2).
- `deleteCheckIn` correctly reverts `appointment_clients.attended`→null and decrements credits in one tx (sound).
