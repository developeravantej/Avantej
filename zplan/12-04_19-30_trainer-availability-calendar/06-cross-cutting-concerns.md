# 6. Cross-Cutting Concerns

## Error Handling Strategy

| Layer | Strategy |
|-------|----------|
| **Service** | Throw plain `Error` with descriptive messages for validation failures (overlap, invalid time range). Let unexpected errors propagate. |
| **Router** | Catch service errors and wrap in `ORPCError` with appropriate codes (`BAD_REQUEST` for validation, `FORBIDDEN` for permission, `INTERNAL_SERVER_ERROR` for unexpected). |
| **Frontend** | Use `toast.error()` for mutation failures. Use TanStack Query's `error` state for query failures with inline error messages. |

### Specific Error Cases

| Scenario | Service Error | Router Error Code | UI Behavior |
|----------|---------------|-------------------|-------------|
| Overlapping shifts | `"Overlapping shifts on monday: ..."` | `BAD_REQUEST` | Toast with the overlap details |
| endTime <= startTime | `"Invalid time range: 14:00 – 09:00 on monday"` | `BAD_REQUEST` | Toast with the invalid range |
| No permission | N/A (checked in router) | `FORBIDDEN` | Toast "Permission denied" |
| Trainer not found | FK violation at DB level | `BAD_REQUEST` | Toast "Failed to update availability" |
| Network error | N/A | N/A | TanStack Query retry (3 attempts) + error state |

## Testing Approach

### Unit Tests (Phase 1)

**File to create:** `apps/server/src/tests/unit/services/trainer-availability.test.ts`

Test cases:
- `upsertTrainerAvailability` — happy path: insert 3 shifts, verify returned rows.
- `upsertTrainerAvailability` — replace: insert shifts, then upsert with different shifts, verify old ones deleted.
- `upsertTrainerAvailability` — empty array: clears all availability.
- `upsertTrainerAvailability` — validation: rejects overlapping shifts on same day.
- `upsertTrainerAvailability` — validation: rejects endTime <= startTime.
- `upsertTrainerAvailability` — validation: allows same times on different days (no cross-day conflict).
- `listTrainerAvailability` — returns only the specified trainer's records.
- `deleteTrainerAvailabilitySlot` — removes a single slot.

**File to create:** `apps/server/src/tests/unit/services/appointment-trainer-filter.test.ts`

Test cases:
- `listAppointments` with `trainerId` — returns only matching appointments.
- `listAppointments` without `trainerId` — returns all (regression test).
- `listAppointments` with `trainerId` + `branchId` — both filters apply.

### Integration Tests (Phase 1)

Test the router endpoints against a real tenant DB:
- `POST /rpc/trainerAvailability/upsert` — create availability, verify with list.
- `POST /rpc/trainerAvailability/list` — verify filtering.
- `POST /rpc/appointments/list` with `trainerId` — verify filtering.

### Frontend Tests (Phase 2 & 3)

**Availability editor:** Test that the component renders day rows, adds/removes shifts, calls upsert on save. Mock `@/utils/orpc`.

**Trainer sidebar:** Test that it renders trainer list, handles click selection, filters on search. Mock `@/utils/orpc`.

**Appointment view:** Test that:
- Admin role renders sidebar + calendar.
- Trainer role renders calendar only (no sidebar).
- Selecting a trainer in sidebar triggers re-query with trainerId.

## Migration Plan

### Schema Migration

1. **Development:** `bun db:push` applies the schema directly (no migration file needed for dev).
2. **Production (tenant DBs):** The migration SQL is embedded in `migrate-tenant.ts` as a constant (following existing pattern). When `migrateTenantDb()` runs for each tenant, it applies the new migration.
3. **Rollback:** The migration only creates a new table — rollback is `DROP TABLE trainer_availability`. No existing tables are modified.

### Data Migration

None required. The `trainer_availability` table starts empty. Admins populate it through the UI.

## Rollback Strategy

| Component | Rollback Action | Risk |
|-----------|----------------|------|
| DB table | `DROP TABLE trainer_availability` | None — new table with no dependencies |
| Service file | Delete file, remove exports from index | None — no existing code calls it |
| Router | Remove from `baseRouter`, delete file | None — frontend would get 404 on the new endpoints, but existing endpoints unaffected |
| `trainerId` filter on appointments.list | Remove optional field from input schema and service | None — additive change, removal is safe |
| Appointment view UI | Revert to previous single-column layout | None — git revert |
| Trainers page UI | Remove availability collapsible section | None — git revert |

**All changes are independently rollback-safe.** No existing functionality is removed or modified in a breaking way.

## Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| Trainer sidebar queries `members.list` on every page load | TanStack Query caching with `staleTime: 5 * 60 * 1000` (5 min). Trainers don't change frequently. |
| Availability list query per trainer edit | Lightweight query — small table, indexed on `trainerId`. No concern. |
| Appointment list with `trainerId` filter | Uses existing index `appointments_trainer_id_idx` (already defined in the appointments schema). No new index needed. |
| Profile enrichment for sidebar | Optional. If too expensive, skip profile fetch and show names only. Can be added later with `staleTime` caching. |
| Sidebar + calendar parallel queries | Both fire on page load. `members.list` is cached; `appointments.list` is the main query. No performance regression vs. current single-query page. |
