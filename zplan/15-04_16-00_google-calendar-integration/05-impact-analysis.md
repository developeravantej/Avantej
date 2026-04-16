# Impact & Breakage Analysis

## Files Modified (Existing)

### 1. `packages/db/src/schema/tenant/index.ts`
- **Change:** Add export for `googleCalendarConnections` and `googleCalendarEventMappings`
- **Callers:** `packages/db/src/schema/tenant-schema.ts` (barrel re-export), `packages/db/src/migrate-tenant.ts` (migration)
- **Risk:** Low — additive only. New exports don't affect existing imports.

### 2. `packages/db/src/schema/tenant/appointments.ts`
- **Change:** Add `googleCalendarEventId: text("google_calendar_event_id")` column
- **Callers:**
  - `packages/services/src/appointment.service.ts` — reads/writes appointments. **Not affected** — new nullable column, existing queries don't select it explicitly (uses `.*` or specific fields that don't include this).
  - `packages/api/src/routers/appointments.ts` — create/update handlers. **Modified in Phase 2** to add sync calls.
  - `apps/server/src/routers/auth.ts` — reads appointments for user context? **No** — auth router doesn't touch appointments.
- **Risk:** Low — nullable column addition. No existing code breaks. Migration is a simple `ALTER TABLE ADD COLUMN`.

### 3. `packages/api/src/routers/index.ts`
- **Change:** Import `googleCalendarRouter`, add to `baseRouter`
- **Callers:** `apps/server/src/index.ts` (creates oRPC handler from `appRouter`), client type generation
- **Risk:** Low — additive. Must also add type stub in `appRouter` for client-side type inference (same pattern as other routers).

### 4. `packages/api/src/routers/appointments.ts`
- **Change:** Add fire-and-forget sync calls after create/update handlers
- **Callers:** All frontend code calling `client.appointments.create/update`
- **Risk:** Medium — the sync call must NOT throw (wrapped in `.catch()`). If it accidentally throws synchronously before the promise, it could break appointment creation. **Mitigation:** Wrap in try-catch AND .catch().
- **Return type:** Unchanged — the sync is fire-and-forget, doesn't modify the response.

### 5. `packages/services/src/index.ts`
- **Change:** Add exports for google-calendar service functions
- **Callers:** All packages importing from `@avantej-core/services`
- **Risk:** Low — additive exports only.

### 6. `apps/server/src/index.ts`
- **Change:** Import and mount google-calendar Hono route: `app.route("/auth/google-calendar", googleCalendarRoutes)`
- **Risk:** Low — new route, doesn't conflict with existing routes. Must be mounted AFTER `dbMiddleware` so the callback can access `controlPanelPool`.

### 7. `apps/web/src/components/app-sidebar.tsx`
- **Change:** Add "Google Calendar" link under Config section
- **Risk:** Low — additive navigation item.

### 8. `packages/db/src/migrate-tenant.ts`
- **Change:** Embed new migration SQL for the two new tables + appointments column
- **Risk:** Medium — must follow exact existing pattern. Check latest migration number and increment. The migration SQL must match what `db:generate` produces.

## Files Created (New)

| File | Owner |
|------|-------|
| `packages/db/src/schema/tenant/google-calendar-connections.ts` | Schema |
| `packages/db/src/schema/tenant/google-calendar-event-mappings.ts` | Schema |
| `packages/services/src/google-calendar.service.ts` | Service |
| `packages/services/src/google-calendar-sync.service.ts` | Service |
| `packages/api/src/routers/google-calendar.ts` | API |
| `apps/server/src/routes/google-calendar.ts` | Server |
| `apps/web/src/routes/_authenticated/dashboard/_layout/settings/google-calendar.tsx` | Frontend |
| `apps/server/src/tests/unit/services/google-calendar.test.ts` | Tests |

## Deployment Coupling

### Phase 1 (OAuth flow)
- **DB migration** must deploy before server (new table must exist before code references it)
- **Server** and **frontend** can deploy independently — the frontend navigates to server routes, but if the route doesn't exist yet, the user just gets a 404 (non-destructive)
- **Recommended:** Deploy in order: migration → server → frontend

### Phase 2 (Sync)
- **DB migration** (event mappings table) must deploy before server
- **Server** changes are backward-compatible — the sync is additive (fire-and-forget), doesn't change appointment create/update response shape
- **Frontend** changes in Phase 2 are minimal (settings page polish) — can deploy independently

### Phase 3 (Edge cases)
- All changes are server-side logic. No frontend deployment required.
- Can deploy independently.

## Blocking Prerequisites

1. **Google Cloud Console setup** — must be done before any development starts:
   - Create OAuth 2.0 credentials (web application type)
   - Set authorized redirect URI: `http://localhost:3000/auth/google-calendar/callback`
   - Enable Google Calendar API
   - Set up OAuth consent screen (internal or external depending on user base)

2. **Environment variables** — must be available before testing:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`

3. **Tenant DB migration** — the `google_calendar_connections` table must exist in all tenant databases before the feature is usable. The `migrate-tenant.ts` embedded migration pattern handles this for existing tenants.

## Return Type Changes

**None.** All existing API procedures keep their current return types. The new `googleCalendar` router adds new procedures only. The appointment create/update return types are unchanged — the sync is a side effect.

## Nullable Fields / Assumptions

- `googleCalendarEventId` on appointments — **nullable**. Only populated after successful Google sync. All existing code that reads appointments won't break because they don't reference this field.
- `refreshToken` on connections — **NOT NULL**. Google always provides a refresh token on first authorization when `prompt=consent` and `access_type=offline` are set. If the user later re-authorizes without `prompt=consent`, Google may omit the refresh token — but our URL always sets these params.
- `tokens.refresh_token` in the callback — technically optional in Google's response. Must check for its presence and throw a clear error if missing (suggests the OAuth URL was misconfigured).
