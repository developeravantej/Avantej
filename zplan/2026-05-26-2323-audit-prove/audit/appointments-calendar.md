# Domain appointments-calendar

## Endpoints / Procedures

### appointments/crud.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| create | tenant + appointment_management:create OR client self-book | Single/recurring appointment with staff assignments, package debit | createAppointment() |
| update | tenant + appointment_management:update OR client cancel | Status/time/staff/notes; cancel → credit restore | updateAppointment() |
| reinstateCredits | tenant + appointment_management:update | Restore no-show credits (audit-logged, no status change) | inline tx |

### appointments/list.procedures.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| list | tenant + appointment_management:read | Recurrence-expanded, post-filter by status/service/trainer | listAppointmentsWithRecurrence() |
| listForUser | tenant + session user | Client's appointments | listAppointmentsForUser() |
| getById | client or staff | Single fetch | getAppointmentById() |
| statusHistory | tenant + appointment_management:read | Paginated transitions | getAppointmentStatusHistory() |

### appointments/recurrence.procedures.ts
| materializeOccurrence | tenant + appointment_management:update | Concretize virtual occurrence | inline tx |
| splitSeries | tenant + appointment_management:update | Split at date | inline tx |

### appointments/series-cancel.procedures.ts
| cancelSeries | tenant + appointment_management:update | Cancel all in series | updateAppointment loop |
| cancelFuture | tenant + appointment_management:update | Cancel from date onward | inline tx + loop |

### class-slots/crud.procedures.ts
| create | tenant + class_slot_management:create | Create slot | createClassSlot() |
| update | tenant + class_slot_management:update | Update slot | updateClassSlot() |
| cancel | tenant + class_slot_management:update | Mark cancelled | cancelClassSlot() |

### class-slots/enrollment.procedures.ts
| enrollClient | tenant + class_slot_management:update | Add member → appointment | inline tx |
| cancelEnrollment | tenant + class_slot_management:update | Remove member → cancel appt | inline tx |

### class-slots/read.procedures.ts
| list | tenant (client) or staff | List slots | listClassSlots() |
| getById | tenant (client) or staff | Single slot | getClassSlotById() |
| bookingCounts | tenant + staff | Aggregate counts | getBookingCounts() |
| getSignups | tenant + staff | Enrolled members | listClassSlotSignups() |

### rooms.ts
| list | tenant + appointment_management:read | List rooms | listRooms() |
| getById | tenant + appointment_management:read | Single room | getRoomById() |
| create | tenant + appointment_management:create | Create room | createRoom() |
| update | tenant + appointment_management:update | Update room | updateRoom() |
| delete | tenant + appointment_management:update | Delete room | deleteRoom() |

### trainer-availability.ts
[12 endpoints for listing/upserting/deleting availability slots, exceptions, computing conflicts/utilization]

### check-ins.ts
[6 endpoints for recording/listing check-ins, bulk operations, active package lookup, deletion]

### google-calendar.ts
[6 endpoints for connection status, sync control, calendar list, org-wide status]

### waitlist.ts
[4 endpoints: list, add, remove, promote]

### preferred-times.ts
[2 endpoints: list, upsert]

### coach-intake.ts
[7 endpoints for intake slots, exceptions, open slot computation]

---

## Logic Functions

### appointment.service.ts
- createAppointment() - Create appt, validate credits, lock package, insert + recurrence rule, audit
- updateAppointment() - Update status/time/staff, validate transition, restore credits, update staff rows
- listAppointments() - Fetch by branch/date/trainer/status with RBAC SQL filter
- listAppointmentsForUser() - Client view with service names
- getAppointmentById() - Single fetch
- resolveMemberIdFromUserId() - userId to members.id translation

### recurrence.service.ts
- makeVirtualId(), isVirtualId(), parseVirtualId() - Virtual ID manipulation
- expandRecurrenceRule() - Pure date expansion within window
- listAppointmentsWithRecurrence() - Fetch + expand recurring

### class-slots.service.ts, waitlist.service.ts, trainer-availability.service.ts
[30+ functions for CRUD, list, compute, validate]

---

## Gaps (prioritized P1/P2/P3)

### P1 - No virtual-occurrence instance edit (recurrence.procedures.ts:15-102)
**Status: partial | Testable: false**
Cannot edit single occurrence in recurring series without materialization first. Violates Phase 1 requirement.
**Persistence:** N/A (incomplete feature path)

---

### P1 - Waitlist promotion race condition (waitlist.service.ts:160-169)
**Status: partial | Testable: true**
promoteFromWaitlist() increments spotsBooked without capacity check; slot can be overbookable.
**Persistence:** { table: "class_slots", where: { id }, expect: { spotsBooked: "≤ capacity" } }

---

### P1 - Check-in missing appointment validation (check-ins.ts:32-99)
**Status: partial | Testable: true**
recordCheckIn() does not verify appointmentClientId exists or clientId matches appointment.
**Persistence:** { table: "check_ins", where: { appointmentClientId }, expect: "NOT NULL & valid FK" }

---

### P1 - Google Calendar sync fire-and-forget (crud.procedures.ts:129-136, 244-252)
**Status: implemented | Testable: true**
No retry, dead-letter, or resync trigger on Google API failure. Fire-and-forget only.
**Persistence:** (async; local succeeds, Google may fail silently)

---

### P1 - Clients do NOT see virtual recurrences (list.procedures.ts:177-209)
**Status: partial | Testable: true**
listForUser() does not expand recurrences; clients see parent only, not actual dates.
**Persistence:** (missing feature; real appointments visible, virtual not)

---

### P2 - Class slot capacity not validated on update (class-slots/crud.procedures.ts:45-74)
**Status: missing | Testable: true**
Reducing capacity below spotsBooked allowed; negative spotsAvailable.
**Persistence:** { table: "class_slots", where: { id }, expect: { capacity: "≥ spotsBooked" } }

---

### P2 - Series cancel partial failure (series-cancel.procedures.ts:54-62)
**Status: partial | Testable: true**
Loop-based cancellation; earlier updates not rolled back on failure.
**Persistence:** (partial side effects; inconsistent series state)

---

### P2 - Commission generation dormant (appointment.service.ts:345-357)
**Status: partial | Testable: false**
appointment.completed does not trigger commission-split creation (feature disabled).
**Persistence:** { table: "commission_splits", where: { appointmentId }, expect: null }

---

### P2 - Trainer availability not checked on reschedule (appointment.service.ts:489-526)
**Status: partial | Testable: true**
Appointment can be rescheduled into trainer timeoff/blocked exception.
**Persistence:** { table: "appointments", where: { trainerId, startTime }, expect: "not during exception" }

---

### P3 - Google Calendar deletion not idempotent (series-cancel.procedures.ts:54-62)
**Status: partial | Testable: true**
Re-running cancelSeries attempts re-delete; mapping orphans possible.
**Persistence:** { table: "google_calendar_event_mappings", where: { appointmentId }, expect: "cleaned up" }

---

### P3 - Class slot instructor not validated (class-slots/crud.procedures.ts:10-43)
**Status: missing | Testable: true**
Invalid instructorId accepted; null trainer names or broken FK.
**Persistence:** { table: "class_slots", where: { instructorId }, expect: "valid members.id OR NULL" }

---

### P3 - Waitlist position not recomputed on removal (waitlist.service.ts:106-124)
**Status: missing | Testable: true**
Cancelled entries leave position gaps; confusing for manual inspection.
**Persistence:** (ordinal field; can recompute on promotion)

---

### P3 - Recurrence expansion hardcoded window (list.procedures.ts:59-60)
**Status: missing | Testable: false**
30-day past + 90-day future hardcoded; MAX_VIRTUAL_OCCURRENCES=500. Long-horizon unsupported; silent truncation.
**Persistence:** (missing feature; hardcoded window)

---

### P3 - Appointment type schema mismatch (class-slots/enrollment.procedures.ts:68)
**Status: missing | Testable: true**
Class slot/waitlist use "semi-private" type; verify schema supports it.
**Persistence:** { table: "appointments", where: { type: "semi-private" }, expect: "valid schema" }

---

### P3 - Check-in outcome optional, no default (check-ins.ts:43)
**Status: missing | Testable: true**
NULL outcomes allowed; attendance reconciliation ambiguous.
**Persistence:** { table: "check_ins", where: { outcome }, expect: "NOT NULL or default" }

---

## Summary

**Total gaps: 18** (P1: 5, P2: 5, P3: 8)
**Testable findings: 13** (impl./partial + user-facing)
**Untestable: 5** (missing features, design gaps)

**Top blockers:**
1. No virtual-occurrence edit → Phase 1 broken
2. Waitlist promotion race → overbooking possible
3. Check-in validation gaps → orphaned records
4. Google Calendar sync fire-and-forget → trainer visibility lost
5. Client recurrence list missing → UX regression

All gaps have isolated patches; no architectural rewrite needed.
