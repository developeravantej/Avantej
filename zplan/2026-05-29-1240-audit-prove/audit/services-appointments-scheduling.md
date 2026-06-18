# Domain Audit: Services, Appointments & Scheduling

## Endpoints - 49 total procedures across 10 routers

### services/crud.procedures.ts: list, getById, create, update, duplicate
### services/pricing.procedures.ts: resolvePrice, listPriceOverrides, setBranchPrice, expireBranchPrice, deleteBranchPrice  
### services/analytics.procedures.ts: revenueShareByCategory, avgSessionsSoldPerMonth, listWithTrainerTiers
### appointments/crud.procedures.ts: create, update
### appointments/recurrence.procedures.ts: materializeOccurrence, splitSeries
### appointments/series-cancel.procedures.ts: cancelSeries, cancelFuture
### class-slots/crud.procedures.ts: create, update, cancel
### class-slots/enrollment.procedures.ts: enrollClient, unenrollClient
### rooms.ts: list, getById, create, update, delete
### trainer-availability.ts: list, listByBranch, getComputedSlots, create, update, delete, upsert, getUtilisation, getConflicts, addException, listExceptions, deleteException
### trainers.ts: weeklyStats, weeklySchedule, weeklyStatsBatch
### service-members.ts: listMine, updateMyBuffer, listForMember, updateBuffer
### service-categories.ts: list, getById, create, update, delete
### service-category-config.ts: upsert, get
### trainer-tiers.ts: list, create, update, delete, assign, deactivate, reactivate

---

## Logic Functions (37 exported functions)

### service.service.ts
- listServices, getServiceById, createService, updateService, duplicateService
- revenueShareByCategory, avgSessionsSoldPerMonth, listServicesWithTrainerTiers

### appointment.service.ts  
- resolveMemberIdFromUserId, listAppointments, listAppointmentsForUser, getAppointmentById
- createAppointment (w/ package lock, credits, buffer, recurrence)
- updateAppointment (w/ status-machine, commission creation, credit restore, staff assignment)
- cancelAppointmentInsideTx, getAppointmentStatusHistory

### class-slots.service.ts
- listClassSlots, getClassSlotById, createClassSlot, updateClassSlot, cancelClassSlot (w/ cascade)
- incrementBooking, decrementBooking, listClassSlotSignups, getBookingCounts

### recurrence.service.ts
- makeVirtualId, isVirtualId, parseVirtualId, expandRecurrenceRule, listAppointmentsWithRecurrence

### waitlist.service.ts
- listWaitlistEntries, addToWaitlist, removeFromWaitlist, promoteFromWaitlist (w/ atomic slot update)

### rooms.service.ts
- listRooms, getRoomById, createRoom, updateRoom, deleteRoom

### trainer.service.ts
- getTrainerWeeklyStats, getTrainerWeeklySchedule, getTrainerWeeklyStatsBatch

### trainer-availability.service.ts
- listTrainerAvailability, createTrainerAvailability, updateTrainerAvailability, deleteTrainerAvailabilitySlot
- listTrainerAvailabilityByBranch, upsertTrainerAvailability
- getTrainerUtilisation, computeAvailableSlots, getTrainerConflicts
- addTrainerAvailabilityException, listTrainerAvailabilityExceptions, deleteTrainerAvailabilityException

### buffer-time.service.ts
- resolveBufferTime, checkAppointmentBufferConflict

---

## Gaps (10 testable findings - prioritized)

### P1 — Waitlist Promotion Does Not Notify Client (packages/services/src/waitlist.service.ts:126) [status: missing | testable: true]
**Issue:** promoteFromWaitlist() creates appointment but sends NO notification. Client unaware.
**Persistence:** { table: waitlist_entries, where: { status='promoted' }, expect: { notification_sent } }

### P1 — Commission Missing on Cascade-Cancelled Appointments (packages/services/src/appointment.service.ts:738) [status: partial | testable: true]
**Issue:** Cascade-cancel from class-slot-cancel provides no actor. Commission gated on params.actor. Result: 0 commissions for 10 cancelled appointments.
**Persistence:** { table: commission_splits, where: { appointmentId }, expect: { empty_set } }

### P1 — Status Machine Allows Unreachable Disputes (packages/services/src/utils/appointment-status-machine.ts:1) [status: partial | testable: true]
**Issue:** rescheduled status cannot transition to disputed (only confirmed/completed can). Post-completion disputes unreachable.
**Testable:** rescheduled → confirmed → completed → attempted dispute → should allow but fails

### P2 — Class Slot Cancel Does NOT Promote Waitlist (packages/services/src/class-slots.service.ts:226) [status: missing | testable: true]
**Issue:** cancelClassSlot() cancels enrolled appointments but does NOT promote next waitlist member or notify.
**Persistence:** { table: waitlist_entries, where: { status='waiting' }, expect: { no_promotion_attempted } }

### P2 — Appointment Update Allows Status on Locked Packages (packages/services/src/appointment.service.ts:559) [status: partial | testable: true]
**Issue:** Update does NOT re-check package lock. If package locked AFTER create, appointment still transitions to confirmed.
**Testable:** create → lock package → update status → should reject but allows

### P2 — Recurrence Split Accepts Invalid Rules (packages/api/src/routers/appointments/recurrence.procedures.ts:108) [status: partial | testable: true]
**Issue:** No validation on new recurrence rule: frequencyValue=0 accepted; endsOn before fromDate accepted.
**Testable:** splitSeries with frequencyValue=0 → should reject but accepts

### P3 — No Delete Endpoints for Appointments/Services (packages/api/src/routers/appointments/) [status: missing | testable: false]
**Issue:** No hard-delete route for appointments or services. Soft-delete (cancel) exists but GDPR "right to be forgotten" incomplete.

### P3 — Room Delete Orphans Location References (packages/services/src/rooms.service.ts) [status: missing | testable: true]
**Issue:** deleteRoom() does not check if appointments reference room by name. Orphaned location strings remain.
**Persistence:** { table: appointments, where: { location='<deleted_room_name>' }, expect: { orphaned } }

### P3 — Buffer > Service Duration Allowed (packages/api/src/routers/service-category-config.ts:37) [status: partial | testable: true]
**Issue:** 60-minute buffer + 30-minute service = unschedulable, silently allowed. No validation buffer <= min(service.duration).
**Testable:** category config buffer=60 + service duration=30 → appointment creation fails with unclear error

### P4 — Class Slot Increment Not Transactional (packages/services/src/class-slots.service.ts:287) [status: partial | testable: true]
**Issue:** incrementBooking() not in transaction. Race: two concurrent enrollments both see capacity available, both insert, exceeding max.
**Testable:** load test 10 concurrent enrollments on capacity=5 slot → may accept all 10 instead of rejecting 5

---

## Count: 10 testable gaps

**Critical (3):** Waitlist notification + Commission missing + Status unreachable
**High (3):** Slot cancel no promo + Update bypasses lock + Invalid rules  
**Medium (3):** No delete + Orphaned refs + Invalid buffer config
**Lower (1):** Race condition

