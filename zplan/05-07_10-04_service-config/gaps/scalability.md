# Scalability Audit — Pass 1

**Auditor:** scalability-auditor
**Date:** 2026-05-07

## Query Analysis

### `listForService` procedure

```sql
SELECT service_members.member_id, service_members.is_primary, member_profiles.display_name
FROM service_members
LEFT JOIN member_profiles ON service_members.member_id = member_profiles.member_id
WHERE service_members.service_id = $1
```

**Index usage:**
- `service_members_service_idx` on `serviceId` — EXISTS (confirmed). Query hits this index directly.
- `member_profiles_member_idx` on `memberId` — EXISTS. The LEFT JOIN uses this index.

**N+1 risk:** NONE. Single query with JOIN. **SAFE.**

**Cardinality:** A typical service has 1–20 trainers. This is a trivially small result set. No pagination needed.

### TrainersTab — `members.list` for assign picker

```typescript
useQuery(members.list, { role: "trainer", status: "active" })
```

This fetches ALL active trainers in the organization. For a typical fitness franchise with 10–50 trainers, this is negligible. The `staleTime: 5 * 60 * 1000` prevents refetching.

**N+1 risk:** NONE — single query.

**Unbounded list concern:** If an organization has 500+ trainers (unlikely for the fitness domain), the picker dropdown becomes unwieldy. The plan uses a `<Select>` not a `<Combobox>`. For very large orgs, a combobox with search would be better.

**FINDING SC1 — LOW:** Use `Combobox` (searchable) instead of plain `Select` for the assign trainer picker when the unassigned list exceeds ~20 items. The plan specifies either combobox or Select — implement as Combobox to be safe. Not a scalability bloat issue at current org sizes, but future-proof.

### `useAppointmentFormState` — service-scoped trainer query

```typescript
useQuery(serviceMembers.listForService, { organizationId, serviceId: firstServiceId! })
enabled: !!organizationId && !!firstServiceId
```

**Conditional query:** Fires only when `firstServiceId` is set. No per-keystroke queries.

**staleTime:** Plan specifies `2 * 60 * 1000` (2 minutes). Reasonable — trainer assignments don't change frequently.

**N+1 risk:** NONE — single query per service selection.

**Render loop risk:** Every time `newAppointment.selectedServices` changes, `firstServiceId` updates. If the user is rapidly adding/removing services, this triggers multiple queries. The `staleTime` caching prevents refetches for the same serviceId within 2 minutes. **ACCEPTABLE.**

### Cache invalidation after assign/remove

The plan invalidates `serviceMembers.listForService.key()` (broad invalidation, no input scoping). This invalidates ALL cached `listForService` queries for ALL services. For the appointment form (Phase 3), this means the cached assignment for the currently-selected service is also cleared, forcing a refetch.

**FINDING SC2 — LOW:** The `listForService` cache invalidation after assign/remove in `TrainersTab` is broad (no input filter). This is correct behavior — when a trainer is assigned/removed, any cached result for that service should be refreshed. The broad invalidation is intentional and appropriate here. No issue.

### Missing index analysis

All required indexes are present:
- `service_members_service_idx` on `(service_id)` — for `listForService` WHERE clause
- `service_members_unique_idx` on `(service_id, member_id)` — for uniqueness on `assign`
- `service_members_member_idx` on `(member_id)` — for `listMine`, `listForMember`, `remove`
- `member_profiles_member_idx` on `(member_id)` — for LEFT JOIN in `listForService`

**No missing indexes.** Plan's claim that `service_members_service_idx` exists is CONFIRMED.

## Unbounded List Concerns

### TrainersTab — assigned trainer list
No pagination. For a service with 50+ assigned trainers, the list grows tall. Given typical fitness domain (2–10 trainers per service), no concern.

### TrainersTab — unassigned picker
Fetches ALL active trainers, filters to unassigned. If org has 100 trainers and all are assigned, the picker shows 0 items — fine. If none are assigned, shows all 100 in a `<Select>` — potentially unwieldy.

## Summary

| ID | Severity | Finding |
|---|---|---|
| SC1 | LOW | Consider Combobox (searchable) for assign picker for large orgs |
| SC2 | VERIFIED | Broad cache invalidation is correct |
| SC3 | VERIFIED | All required indexes exist |
| SC4 | VERIFIED | No N+1 queries introduced |
