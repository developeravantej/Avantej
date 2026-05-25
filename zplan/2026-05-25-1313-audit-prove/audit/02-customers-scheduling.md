# Domain: Customers, Appointments & Scheduling

Audit date: 2026-05-25  
Auditor scope: read-only review of router + service files; no code was modified.

---

## Endpoints / Procedures

### packages/api/src/routers/members/list.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `user_management:read` | List org members with GHL-sync enrichment; RBAC hierarchy filter; soft-delete toggle | inline query (no service fn) |

**Note:** `scope='self'` short-circuit returns `name: "Unknown"` / `email: "Unknown"` because it skips the cross-DB user-detail lookup (line 65-67). The enrichment block at line 116 is only reached for the `scope='all'` path.

### packages/api/src/routers/members/read.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `getById` | tenantProcedure + `user_management:read` | Fetch single member + accessible nodes + CP user detail | `getDescendantNodeIds`, `getMembersNewToday` |
| `newToday` | tenantProcedure + `user_management:read` | Dashboard widget: count + 3 most-recent members joined today | `getMembersNewToday`, `resolveAccessibleNodeIds` |

### packages/api/src/routers/members/create.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `create` | tenantProcedure + `user_management:create` | Create tenant member from existing CP user; best-effort GHL sync | `createMember`, `validateParentAccess`, `getDescendantNodeIds` |

### packages/api/src/routers/customer-directory.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `customer_management:read` | Paginated directory of `role='client'` members with metrics | `listCustomerDirectory` |
| `getStats` | tenantProcedure + `customer_management:read` | KPI stats (total / active / lapsed / lead counts, avg LTV) | `getCustomerStats` |
| `getById` | tenantProcedure + `customer_management:read` | Full detail for one customer + row-level RBAC | `getCustomerDetail` |

### packages/api/src/routers/customer-profiles.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `get` | tenantProcedure (session) | Self-scoped customer profile read | `getCustomerProfile` |
| `upsert` | tenantProcedure (session) | Self-scoped customer profile update (phone, DOB, goals, lead source…) | `upsertCustomerProfile` |
| `upsertForCustomer` | tenantProcedure + `customer_management:update` | Admin-scoped profile edit for any client member | `upsertCustomerProfile` |
| `listLeadSources` | tenantProcedure | Lookup of lead-source rows for pickers | inline Drizzle select |

### packages/api/src/routers/appointments/list.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `appointment_management:read` | Staff view: recurrence-expanded appointment list in date window; post-expansion filters | `listAppointmentsWithRecurrence`, `resolveAccessibleNodeIds` |
| `listForUser` | tenantProcedure (session) | Client view: user's own appointments | `listAppointmentsForUser` |
| `getById` | tenantProcedure (session + RBAC) | Fetch single appointment; client can see their own, staff needs perm | `getAppointmentById` |
| `statusHistory` | tenantProcedure + `appointment_management:read` | Cursor-paginated status-change audit trail | `getAppointmentStatusHistory` |

### packages/api/src/routers/appointments/crud.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `create` | tenantProcedure (client self-book or `appointment_management:create`) | Create appointment with optional recurrence + staff assignments; GCal sync fire-and-forget | `createAppointment`, `syncAppointmentToGoogleCalendar` |
| `update` | tenantProcedure (client cancel-only or `appointment_management:update`) | Update status / time / staff; commission on terminal transition; GCal sync | `updateAppointment`, `syncAppointmentToGoogleCalendar` |

### packages/api/src/routers/appointments/recurrence.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `materializeOccurrence` | tenantProcedure + `appointment_management:create` | Convert a virtual occurrence into a real DB row with optional overrides | inline insert |
| `splitSeries` | tenantProcedure + `appointment_management:create` | Split recurring series at a given date; re-parents materialized children | inline transaction |

### packages/api/src/routers/appointments/series-cancel.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `cancelSeries` | tenantProcedure + `appointment_management:create` | Cancel an entire series (parent + all non-completed children) | inline transaction |
| `cancelFuture` | tenantProcedure + `appointment_management:create` | Cancel all occurrences from a given date onward; truncates `recurringEndDate` | inline transaction |

### packages/api/src/routers/class-slots/read.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure (clients exempt; staff need `class_slot_management:read`) | List class slots with waitlist count + price | `listClassSlots` |
| `getById` | tenantProcedure (clients exempt; staff need `class_slot_management:read`) | Fetch single class slot | `getClassSlotById` |
| `bookingCounts` | tenantProcedure + `class_slot_management:read` | Aggregate booked/capacity per slot in a date range | `getBookingCounts` |
| `getSignups` | tenantProcedure + `class_slot_management:read` | List all attendees (member + walk-in) for a slot with CP name/email enrichment | `listClassSlotSignups` |

### packages/api/src/routers/class-slots/crud.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `create` | tenantProcedure + `class_slot_management:create` | Create a new class slot | `createClassSlot` |
| `update` | tenantProcedure + `class_slot_management:update` | Update slot date/time/capacity/instructor/location | `updateClassSlot` |
| `cancel` | tenantProcedure + `class_slot_management:update` | Soft-cancel a slot | `cancelClassSlot` |

### packages/api/src/routers/class-slots/enrollment.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `enrollClient` | tenantProcedure + `class_slot_management:update` | Book a client into a class slot: creates appointment + appointment_client row; increments `spotsBooked` | inline transaction |
| `cancelEnrollment` | tenantProcedure + `class_slot_management:update` | Cancel a class-slot appointment; decrements `spotsBooked` | inline transaction |

### packages/api/src/routers/trainer-availability.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure | List recurring slots for one trainer | `listTrainerAvailability` |
| `listByBranch` | tenantProcedure | All active trainers + their slots, branch-filtered | `listTrainerAvailabilityByBranch` |
| `getComputedSlots` | tenantProcedure | Free time windows for a trainer over a date range (booked time subtracted) | `computeAvailableSlots` |
| `upsert` | tenantProcedure + `appointment_management:update` | Replace all recurring slots for a trainer | `upsertTrainerAvailability` |
| `create` | tenantProcedure + `appointment_management:update` | Add one slot | `createTrainerAvailability` |
| `update` | tenantProcedure + `appointment_management:update` | Update one slot | `updateTrainerAvailability` |
| `delete` | tenantProcedure + `appointment_management:update` | Delete one slot | `deleteTrainerAvailabilitySlot` |
| `getUtilisation` | tenantProcedure | Weekly utilisation % per trainer | `getTrainerUtilisation` |
| `getConflicts` | tenantProcedure | Scheduling conflicts (outside availability, blocked, timeoff) per trainer | `getTrainerConflicts` |
| `addException` | tenantProcedure + `appointment_management:update` | Add date-specific exception (blocked/timeoff) | `addTrainerAvailabilityException` |
| `listExceptions` | tenantProcedure | List exceptions in a date range | `listTrainerAvailabilityExceptions` |
| `deleteException` | tenantProcedure + `appointment_management:update` | Remove a date-specific exception | `deleteTrainerAvailabilityException` |

### packages/api/src/routers/trainers.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `weeklyStats` | tenantProcedure + `user_management:read` + self-or-approve | Per-trainer weekly stats (sessions, utilisation, commission YTD, revenue) | `getTrainerWeeklyStats` |
| `weeklySchedule` | tenantProcedure + `appointment_management:read` | Next-7-days schedule entries (appointments + class slots) | `getTrainerWeeklySchedule` |
| `weeklyStatsBatch` | tenantProcedure + `user_management:approve` | Batch stats for up to 100 trainers | `getTrainerWeeklyStatsBatch` |

### packages/api/src/routers/trainer-tiers.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `trainer_tier_management:read` | List trainer tiers | `listTrainerTiers` |
| `create` | tenantProcedure + `trainer_tier_management:create` | Create tier (checks for missing commission-rate categories) | `createTrainerTier` |
| `update` | tenantProcedure + `trainer_tier_management:update` | Update tier name/description/rank/isActive | `updateTrainerTier` |
| `deactivate` | tenantProcedure + `trainer_tier_management:delete` | Soft-deactivate tier | `deactivateTrainerTier` |
| `reactivate` | tenantProcedure + `trainer_tier_management:update` | Reactivate tier | `reactivateTrainerTier` |
| `assignToMember` | tenantProcedure + `trainer_tier_management:update` | Assign or clear tier on a member | `assignTierToMember` |

### packages/api/src/routers/service-members.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `listMine` | tenantProcedure (session) | Self-scoped: services this member is assigned to + buffer overrides | inline query |
| `updateMyBuffer` | tenantProcedure + org-match | Self-scoped: set/clear buffer override for a service | inline upsert/delete |
| `listForMember` | tenantProcedure + `user_management:read` or `service_management:read` | Admin: services for a given member + buffers | inline query |
| `assign` | tenantProcedure + `user_management:update` or `service_management:update` | Add member to service | inline insert |
| `updateBuffer` | tenantProcedure + `user_management:update` or `service_management:update` | Admin: set/clear buffer override | inline upsert/delete |
| `remove` | tenantProcedure + `user_management:update` or `service_management:update` | Remove member from service + clear buffer | inline delete |
| `listForService` | tenantProcedure + `user_management:read` or `service_management:read` or `appointment_management:read` | All members assigned to a service | inline join |

### packages/api/src/routers/coach-intake.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `listSlots` | tenantProcedure | List recurring intake slots for a trainer | `listCoachIntakeSlots` |
| `upsertSlots` | tenantProcedure (admin or self) | Replace all intake slots | `upsertCoachIntakeSlots` |
| `getOpenSlots` | tenantProcedure | Compute open (unclaimed) intake windows in a date range | `computeOpenIntakeSlots` |
| `claimSlot` | tenantProcedure (admin or self) | Block a specific intake slot | `claimIntakeSlot` |
| `unclaimSlot` | tenantProcedure | Delete a slot exception (unclaim) | `unclaimIntakeSlot` |
| `listExceptions` | tenantProcedure | List claimed/blocked exceptions in a date range | `listIntakeExceptions` |
| `listByBranch` | tenantProcedure | All coaches + their intake slots, branch-filtered | `listCoachIntakeByBranch` |

### packages/api/src/routers/waitlist.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `appointment_management:read` | List waitlist entries (by slot or member) | `listWaitlistEntries` |
| `add` | tenantProcedure + `appointment_management:create` | Add member to waitlist (only when slot is full) | `addToWaitlist` |
| `remove` | tenantProcedure + `appointment_management:update` | Soft-cancel a waitlist entry | `removeFromWaitlist` |
| `promote` | tenantProcedure + `appointment_management:update` | Promote first waiting entry to 'promoted'; increments slot counters | `promoteFromWaitlist` |

### packages/api/src/routers/preferred-times.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure (client-self or staff) | List preferred times for a package instance | `listPreferredTimes` |
| `upsert` | tenantProcedure (client-self or `service_management:update`) | Replace preferred times for a package instance (max 4) | `upsertPreferredTimes` |

---

## Logic Functions

### packages/services/src/member.service.ts
- `getMembersByHierarchyScope()` — Query members by hierarchy node [ORPHAN — no router calls it directly]
- `updateMemberHierarchyScope()` — Move one member to a new hierarchy node + refresh branch stats
- `bulkUpdateMemberHierarchyScope()` — Batch-move members to a new node [ORPHAN — no router in this domain calls it; may be used in move.procedures.ts]
- `getAllOrganizationMembersWithUserDetails()` — Full org member list with CP-join [ORPHAN in this domain — not called by any in-scope router]
- `createMember()` — Dual-write: control panel + tenant DB + GHL sync
- `deactivateMember()` — Set `status='inactive'` + audit log

### packages/services/src/member-profile.service.ts
- `getMemberProfile()` — Get member profile by `memberId`
- `upsertMemberProfile()` — Upsert member profile (displayName, bio, specialization, imageUrl, phone, certifications)

### packages/services/src/member-stats.service.ts
- `getMembersNewToday()` — Count + top-3 most-recent new-today members scoped by accessible nodes

### packages/services/src/appointment.service.ts
- `resolveMemberIdFromUserId()` — Translate `members.userId` → `members.id` for staff assignments
- `listAppointments()` — Staff list with RBAC filter [ORPHAN in this domain — `listAppointmentsWithRecurrence` is used instead in the `list` procedure]
- `listAppointmentsForUser()` — Client view of own appointments
- `getAppointmentById()` — Fetch single row
- `createAppointment()` — Full transactional create: package lock, credit deduction, staff assignments, audit, recurrence
- `updateAppointment()` — Full transactional update: status machine, credit restore, staff replace, commission on terminal transition, audit, status history
- `getAppointmentStatusHistory()` — Cursor-paginated status history
- `runAppointmentCommission()` (private) — Calculate + persist commission splits on terminal transition

### packages/services/src/recurrence.service.ts
- `makeVirtualId()` — Build synthetic ID for a virtual occurrence
- `isVirtualId()` — Test whether an ID is synthetic
- `parseVirtualId()` — Decompose synthetic ID
- `expandRecurrenceRule()` — Pure-function rule expansion to occurrence dates
- `listAppointmentsWithRecurrence()` — Merged query: standalone + virtual + materialized rows

### packages/services/src/utils/appointment-status-machine.ts
- `assertValidTransition()` — Guard valid status transitions (throws on invalid)

### packages/services/src/class-slots.service.ts
- `listClassSlots()` — Paginated list with waitlist count + price JOIN
- `getClassSlotById()` — Single fetch
- `createClassSlot()` — Insert new slot
- `updateClassSlot()` — Update slot (recomputes availability on capacity change)
- `cancelClassSlot()` — Soft-cancel
- `incrementBooking()` — Increment `spotsBooked`; check capacity [ORPHAN — enrollment.procedures.ts does inline increment, not this fn]
- `decrementBooking()` — Decrement `spotsBooked` [ORPHAN — enrollment.procedures.ts does inline decrement, not this fn]
- `listClassSlotSignups()` — All attendees for a slot (member + walk-in)
- `getBookingCounts()` — Aggregate per-slot counts in a date range

### packages/services/src/trainer-availability.service.ts
- `listTrainerAvailability()` — Fetch recurring slots for one trainer
- `upsertTrainerAvailability()` — Delete-all + re-insert (validates overlaps)
- `listTrainerAvailabilityByBranch()` — Branch-scoped trainer availability with CP name enrichment
- `createTrainerAvailability()` — Insert one slot
- `updateTrainerAvailability()` — Update one slot
- `deleteTrainerAvailabilitySlot()` — Delete one slot
- `getTrainerUtilisation()` — Weekly utilisation % per trainer (available mins vs booked mins)
- `computeAvailableSlots()` — Free windows per calendar day (recurring minus booked)
- `subtractBookings()` (private) — Window-subtraction helper
- `getTrainerConflicts()` — Per-trainer conflict list for a week
- `addTrainerAvailabilityException()` — Insert date-specific exception
- `listTrainerAvailabilityExceptions()` — List exceptions in range
- `deleteTrainerAvailabilityException()` — Delete single exception

### packages/services/src/trainer.service.ts
- `getTrainerWeeklyStats()` — Sessions, utilisation, commission YTD, revenue for one trainer
- `getTrainerWeeklySchedule()` — Appointments + class-slot entries for next 7 days
- `getTrainerWeeklyStatsBatch()` — Batch stats for multiple trainers

### packages/services/src/trainer-tier.service.ts
- `listTrainerTiers()` — List tiers (active or all)
- `createTrainerTier()` — Create tier; returns `missingRateCategories` if new tier has no commission rates
- `updateTrainerTier()` — Update tier fields
- `deactivateTrainerTier()` — Soft-deactivate
- `reactivateTrainerTier()` — Re-activate; returns missing-rate categories
- `assignTierToMember()` — Set or clear `members.trainerTierId`

### packages/services/src/customer-directory.service.ts
- `listCustomerDirectory()` — Paginated client list with metrics (LTV, package count, last visit)
- `getCustomerStats()` — Aggregate KPIs for the directory header
- `getCustomerDetail()` — Full member + profile + packages + appointment detail

### packages/services/src/customer-profile.service.ts
- `getCustomerProfile()` — Self-scoped profile read
- `upsertCustomerProfile()` — Self or admin profile upsert

### packages/services/src/coach-intake.service.ts
- `listCoachIntakeSlots()` — Active recurring intake slots for a trainer
- `upsertCoachIntakeSlots()` — Replace all intake slots (soft-deactivates old, inserts new)
- `computeOpenIntakeSlots()` — Compute unclaimed windows in a date range
- `claimIntakeSlot()` — Insert exception to block a slot
- `unclaimIntakeSlot()` — Delete exception
- `listIntakeExceptions()` — List exceptions in range
- `listCoachIntakeByBranch()` — Branch-grouped coach+slots with CP name enrichment

### packages/services/src/waitlist.service.ts
- `listWaitlistEntries()` — List entries filtered by slot/member/status
- `addToWaitlist()` — Add entry (guards: slot must be full, no duplicate)
- `removeFromWaitlist()` — Soft-cancel entry (status → 'cancelled')
- `promoteFromWaitlist()` — Promote first 'waiting' entry; increments slot counters

### packages/services/src/preferred-time.service.ts
- `listPreferredTimes()` — List preferred times for a package instance
- `upsertPreferredTimes()` — Replace all preferred times (max 4, validates days)

---

## Gaps (prioritized P1/P2/...)

### P1 — `no_show` vs `no-show` status mismatch kills no-show commission  
**Files:**  
- `packages/api/src/routers/appointments/schemas.ts:9` — schema emits `"no-show"` (hyphen)  
- `packages/services/src/utils/appointment-status-machine.ts:3,4,7` — machine uses `"no-show"` (hyphen)  
- `packages/services/src/appointment.service.ts:703,704,715,718` — commission trigger checks `params.status === "no_show"` (underscore)  
- `packages/db/src/schema/tenant/appointments.ts:37` — DB comment says `"no-show"` (hyphen)  

**What's wrong:** The router schema, status-machine, and DB schema all agree on `"no-show"` (hyphen), but the commission-split trigger inside `updateAppointment()` compares `params.status === "no_show"` (underscore). This comparison always evaluates to false, so no-show appointments never generate commission splits. Trainers lose commission they are entitled to for attended no-shows.  

status: **partial** | testable: **true**  
persistence: `{ table: commission_splits, where: { appointmentId }, expect: { earnReason: "no_show" } }`

---

### P1 — `members.list` scope='self' returns `name: "Unknown"` / `email: "Unknown"`  
**File:** `packages/api/src/routers/members/list.procedures.ts:63-68`  

**What's wrong:** When `scope='self'` is passed, the handler short-circuits at line 50 and returns the member row with hardcoded `name: "Unknown"` and `email: "Unknown"` without doing the cross-DB user lookup that occurs for `scope='all'`. Any UI or API consumer that calls `list({ scope:'self' })` expecting enriched data will receive placeholder strings.  

status: **partial** | testable: **true**  
persistence: N/A (read-only)

---

### P1 — Waitlist promote has no side-effect: enrolled appointment is never created  
**File:** `packages/services/src/waitlist.service.ts:124-166`  
**File:** `packages/api/src/routers/waitlist.ts:82-98`  

**What's wrong:** `promoteFromWaitlist()` marks the waitlist entry as `'promoted'` and increments `class_slots.spotsBooked`, but it never calls `enrollClient` or creates an `appointment` + `appointment_clients` row. The promoted member has no booking record. Their slot counter is debited but they cannot attend. The `'notified'` status listed in `waitlistEntries.status` schema is also never set — there is no notification mechanism.  

status: **partial** | testable: **true**  
persistence: `{ table: waitlist_entries, where: { id }, expect: { status: "promoted" } }` — appointment row is missing

---

### P1 — `cancelEnrollment` does not restore package credits  
**File:** `packages/api/src/routers/class-slots/enrollment.procedures.ts:109-152`  

**What's wrong:** `cancelEnrollment` sets the appointment status to `'cancelled'` directly via a raw `tx.update(appointments)` call without going through `updateAppointment()`. This bypasses the credit-restore logic in `appointment.service.ts:548-580` that runs when a package-backed appointment is cancelled. If the class-slot enrollment consumed credits from a package instance, those credits are never returned.  

status: **partial** | testable: **true**  
persistence: `{ table: package_instances, where: { id: appointment.packageInstanceId }, expect: { creditsUsed: decremented_by_creditsUsed } }`

---

### P1 — `cancelSeries` / `cancelFuture` use wrong RBAC action (`create` instead of `update`)  
**Files:**  
- `packages/api/src/routers/appointments/series-cancel.procedures.ts:24,74`  
- `packages/api/src/routers/appointments/recurrence.procedures.ts:40,142`  

**What's wrong:** All four procedures in `series-cancel.procedures.ts` and `recurrence.procedures.ts` gate on `appointment_management:create` permission. Cancelling and splitting series are destructive mutation operations — semantically they require `appointment_management:update`. A user with `update` permission but not `create` cannot cancel a recurring series. A user with only `create` (but not `update`) can cancel series, which is likely unintended.  

status: **partial** | testable: **true**

---

### P2 — `splitSeries` drops `packageInstanceId` on the new series  
**File:** `packages/api/src/routers/appointments/recurrence.procedures.ts:205`  
Comment: `packageInstanceId: null, // new series doesn't inherit package`  

**What's wrong:** When a recurring series is split, the new parent has `packageInstanceId: null`. If the original series was booked against a package, the split occurrences become unlinked from the package. Credits for future occurrences will not be tracked against the package, nor will cancellations restore credits. This is documented as intentional in the comment but there is no router-level warning and no UI affordance to prompt the user.  

status: **partial** | testable: **true**

---

### P2 — `cancelEnrollment` does not trigger the status-machine or commission  
**File:** `packages/api/src/routers/class-slots/enrollment.procedures.ts:133`  

**What's wrong:** Cancelling a class enrollment writes `status='cancelled'` directly via `tx.update(appointments)`, bypassing `updateAppointment()`. This means: (a) no status-machine guard (`assertValidTransition`), (b) no `appointment_status_history` row is written, (c) no commission-split generation, and (d) no Google Calendar sync. Trainers lose their no-show commission. Status history is incomplete.  

status: **partial** | testable: **true**  
persistence: `{ table: appointment_status_history, where: { appointmentId }, expect: { toStatus: "cancelled" } }` — row is missing

---

### P2 — `computeAvailableSlots` ignores `trainerAvailabilityExceptions`  
**File:** `packages/services/src/trainer-availability.service.ts:504-579`  

**What's wrong:** `computeAvailableSlots()` (used by `trainerAvailability.getComputedSlots`) subtracts booked appointments from recurring slots but never loads `trainerAvailabilityExceptions`. A date marked as `timeoff` or `blocked` via `addException` is not reflected in the computed free windows. The `getConflicts` and `getUtilisation` functions share the same blind spot.  

status: **missing** | testable: **true**

---

### P2 — `incrementBooking` / `decrementBooking` are orphaned service functions  
**File:** `packages/services/src/class-slots.service.ts:246-303`  

**What's wrong:** `incrementBooking` and `decrementBooking` are exported from `class-slots.service.ts` but are never called — `enrollment.procedures.ts` performs its own inline `spotsBooked` arithmetic in the transaction instead. These functions contain their own capacity-check guards (`isFull`, `isCancelled`) that the inline code does not fully replicate. If another caller ever uses these functions they will behave correctly, but the duplication means future changes to capacity logic may diverge.  

status: **partial** | testable: **false** (dead code)

---

### P2 — `listAppointments()` service fn is orphaned by `listAppointmentsWithRecurrence`  
**File:** `packages/services/src/appointment.service.ts:163-217`  

**What's wrong:** `listAppointments()` is exported but the `appointments.list` router procedure calls `listAppointmentsWithRecurrence()` instead. The original fn is no longer in the call path for any in-domain router. It remains as a potential source of divergence if a new caller is added without realizing `listAppointmentsWithRecurrence` is the canonical path.  

status: **implemented** | testable: **false** (unused in domain)

---

### P2 — Waitlist `add` uses `memberId` parameter as `userId` (field name mismatch)  
**File:**  
- `packages/api/src/routers/waitlist.ts:52-53` — passes `userId: context.member.userId`  
- `packages/services/src/waitlist.service.ts:44` — fn signature `data: { classSlotId, memberId, userId }`  
- `packages/services/src/waitlist.service.ts:64` — duplicate check: `eq(waitlistEntries.userId, data.userId)` — uses `userId` not `memberId`  

**What's wrong:** The router passes both `memberId: input.memberId` (input UUID from the request body) and `userId: context.member.userId` (the actual control-panel userId). The service stores `userId` in `waitlistEntries.userId`. The router's `input.memberId` is a `members.id` UUID, but `waitlistEntries.userId` holds the control-panel user ID. The duplicate-check query at line 64 compares `waitlistEntries.userId` against `data.userId` (correct) but the router's body parameter is called `memberId` which could mislead callers into passing `members.id` instead of `members.userId`.  

status: **partial** | testable: **true**

---

### P2 — `members.list` scope='self' enrichment completely skipped  
(See P1 above for detail — listed again here for prioritization clarity)

---

### P3 — No `delete` (hard-delete) endpoint for class slots  
**Files:** `packages/api/src/routers/class-slots/crud.procedures.ts`, `packages/services/src/class-slots.service.ts`  

**What's wrong:** Only soft-cancel (`cancel`) is exposed. There is no hard-delete or restore procedure. Admins cannot permanently remove a mistakenly created slot.  

status: **missing** | testable: **false**

---

### P3 — Trainer utilisation ignores availability exceptions  
**File:** `packages/services/src/trainer-availability.service.ts:315-403`  

**What's wrong:** `getTrainerUtilisation` computes available hours from recurring weekly slots only, never subtracting days marked as `timeoff` or `blocked` in `trainerAvailabilityExceptions`. A trainer on holiday for a whole week still shows full available hours.  

status: **partial** | testable: **true**

---

### P3 — Appointment `list` base-query window misses recurring parents starting before `startFrom`  
**File:** `packages/services/src/recurrence.service.ts:295-309`  

**What's wrong:** The base query at step 1 filters `appointments.startTime >= startFrom`. A recurring series that started 6 months ago will not appear in the base rows if its `startTime` is before the window, even though it has occurrences within the window. Only when `isRecurring=true` rows are fetched by startTime-in-range can occurrences be generated. Recurring parents created before the window are invisible.  

**Mitigation:** Admins may not see recurring series on the calendar unless the parent itself falls in the window.  

status: **partial** | testable: **true**

---

### P3 — `customers/view` route does not exist; the directory lives at `customers/v2/view`  
**Files:**  
- `apps/web/src/routes/_authenticated/dashboard/_layout/customers/v2/view.tsx` (exists)  
- No file exists at `customers/view.tsx`  

**What's wrong:** The domain spec lists `/dashboard/customers/view` as the Registered Member Directory page but the actual route is `/dashboard/customers/v2/view`. There is no redirect from the old path. Internal links or documentation pointing to `/customers/view` will 404.  

status: **missing** | testable: **true**

---

### P3 — `members.create` requires pre-existing CP user; no invitation fallback in this router  
**File:** `packages/api/src/routers/members/create.procedures.ts:79-83`  

**What's wrong:** If the target email does not exist in the control panel, the procedure throws `NOT_FOUND`. There is no built-in path to invite a new user. Callers must separately use the invitations router. This is a known workflow gap but is not surfaced in the error message.  

status: **partial** | testable: **true**

---

### P3 — Appointment `update` does not validate `no-show` transition for client self-update  
**File:** `packages/api/src/routers/appointments/crud.procedures.ts:192-202`  

**What's wrong:** Clients can only set `status='cancelled'` via the `update` endpoint (enforced at line 193). However if a client somehow sends `status='no-show'`, the check at line 193 (`input.status !== 'cancelled'`) would correctly reject it with a FORBIDDEN. This is fine, but the error message says "Clients can only cancel" without mentioning `no-show`, which could confuse API callers.  

status: **implemented** (correctly blocked) | testable: **false**

---

### P3 — Trainer `weeklyStats` RBAC calls wrong permission resource key  
**File:** `packages/api/src/routers/trainers.ts:43-48`  

**What's wrong:** `weeklyStats` procedure comment says "Requires member_management:read" but the actual `hasPermission` call checks `"user_management", "read"`. The resource name is `user_management` (consistent with the rest of the codebase) so the code is correct, but the comment is wrong. The `weeklyStatsBatch` procedure also has the same comment/code mismatch at lines 134-140.  

status: **implemented** (code correct, comment wrong) | testable: **false**

---

### P3 — `coachIntake.unclaimSlot` has no RBAC guard  
**File:** `packages/api/src/routers/coach-intake.ts:155-167`  

**What's wrong:** `unclaimSlot` calls `unclaimIntakeSlot()` without checking whether the caller is the owner of the exception or an admin. Any authenticated tenant member can delete any trainer's intake exception by guessing the `exceptionId` UUID.  

status: **missing** | testable: **true**

---

### P3 — No `delete` procedure for `members` (only `deactivate`/`archive` in sibling files)  
**File:** scope observation  

The domain exposes `create` and `list` for members but the `deactivate` procedure lives in the members archive/status files (out of scope), not in this domain's create/read/list trio. There is no hard-delete capability — this is likely by design but is worth noting.  

status: **missing** (by design) | testable: **false**

---

## Testable Summary

| Gap | testable |
|-----|---------|
| P1 `no_show` vs `no-show` commission never fires | true |
| P1 `members.list scope='self'` returns Unknown names | true |
| P1 Waitlist promote creates no appointment | true |
| P1 `cancelEnrollment` skips credit restore | true |
| P1 Series-cancel uses wrong RBAC action | true |
| P2 `splitSeries` drops packageInstanceId | true |
| P2 `cancelEnrollment` bypasses status machine / commission / history | true |
| P2 `computeAvailableSlots` ignores exceptions | true |
| P2 Waitlist `add` memberId vs userId confusion | true |
| P3 Trainer utilisation ignores exceptions | true |
| P3 Recurring list misses parents starting before window | true |
| P3 `customers/view` route 404 | true |
| P3 `coachIntake.unclaimSlot` has no ownership guard | true |

**Total testable:true findings: 13**
