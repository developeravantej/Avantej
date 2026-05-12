# Buffer Time

Buffer time is the mandatory gap between consecutive bookings for a service. It accounts for cleanup, preparation, room turnover, or trainer rest between appointments.

## Current Implementation

Buffer time is configured at two levels with a cascade:

```
staff override (service_members.buffer_time_minutes)   <- most specific, wins if set
        | fallback (null)
category default (service_category_config.buffer_time_minutes)  <- applies to all services in category
        | fallback (null / 0)
0 (no buffer -- back-to-back allowed)
```

### Schema

**Category-level default** (`service_category_config`):

```sql
buffer_time_minutes INTEGER NOT NULL DEFAULT 0
```

Set via the service category form. Applies to all services in that category.

**Staff-level override** (`service_members`):

```sql
buffer_time_minutes INTEGER  -- nullable
```

When set, overrides the category default for this specific staff member on this specific service. `NULL` means "use category default".

### Resolution Logic

`packages/services/src/buffer-time.service.ts` exports:

- `resolveBufferTime(tenantDb, serviceId, staffMemberId?)` — returns the effective buffer in minutes
- `checkAppointmentBufferConflict(tenantDb, params)` — checks if a proposed time window (with buffer) overlaps existing appointments for the same trainer

### Enforcement

Enforced in `packages/services/src/appointment.service.ts`:

- **`createAppointment`**: if `serviceId` and `trainerId` are provided, resolves buffer time and rejects if a conflict exists
- **`updateAppointment`**: same check when `startTime` or `duration` changes, excludes the appointment being updated from the conflict check

The router in `packages/api/src/routers/appointments.ts` wraps errors as `ORPCError("BAD_REQUEST")`. The frontend already displays these via toast.

### Migration

Migration `0010_broad_ronan` (embedded in `packages/db/src/migrate-tenant.ts`):

```sql
ALTER TABLE "service_category_config" ADD COLUMN "buffer_time_minutes" integer DEFAULT 0 NOT NULL;
ALTER TABLE "service_members" ADD COLUMN "buffer_time_minutes" integer;
```

---

## Future: Per-Branch Overrides

If branches need different buffer times (e.g., rooms are farther apart at one location), add a `service_buffer_overrides` table:

```
service_buffer_overrides
  id            UUID PK
  serviceId     UUID FK -> services.id (required)
  branchId      UUID FK -> hierarchy_nodes.id (required)
  bufferTimeMinutes  INTEGER NOT NULL
  createdAt     TIMESTAMP
```

Resolution would become: staff override > branch override > category default > 0.

This is not needed now — the staff + category cascade covers current requirements.
