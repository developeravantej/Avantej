# Cross-Cutting Concerns

## Error Handling Strategy

### OAuth Flow Errors
- **User denies consent:** Google redirects with `?error=access_denied` → redirect to settings page with `?gcal=error&message=auth_denied` → show toast "Connection cancelled"
- **Invalid state param:** Redirect to settings page with generic error toast
- **Token exchange fails:** Log server-side, redirect with `?gcal=error&message=token_exchange_failed`
- **Member not found:** Should never happen (user is authenticated), but log and redirect with error

### Sync Errors
- **All sync errors are non-blocking.** The appointment operation always succeeds.
- **Pattern:** `syncAppointmentToGoogleCalendar(...).catch(err => console.error("GCal sync:", err))`
- **Tracking:** Each connection row stores `lastSyncError` — visible on the settings page
- **Token expired:** Auto-refresh via `ensureValidToken()`. If refresh fails → mark connection `isActive: false`, set `lastSyncError`

### API Error Codes from Google
| Google Status | Meaning | Action |
|---------------|---------|--------|
| 401 | Token expired/revoked | Refresh token; if refresh fails, deactivate connection |
| 403 | Calendar API not enabled or quota exceeded | Log error, set `lastSyncError` |
| 404 | Event not found (already deleted) | Ignore silently on delete operations |
| 429 | Rate limited | Log, don't retry in v1 |

## Testing Approach

### Unit Tests (Phase 3, Task 3.4)
- `google-calendar.service.ts` — mock `fetch`, test URL construction, token exchange, event building
- `google-calendar-sync.service.ts` — mock tenant DB and service functions, test sync scope logic
- Use existing test infrastructure in `apps/server/src/tests/helpers/`

### Integration Tests (Future)
- Not in v1 scope — requires a test Google account with Calendar API
- Could use Google's OAuth playground for manual testing

### Manual Testing Checklist
- [ ] Connect as trainer → verify OAuth flow completes
- [ ] Connect as admin → verify syncScope is "all"
- [ ] Create appointment with connected trainer → verify Google Calendar event appears
- [ ] Update appointment time → verify Google Calendar event updates
- [ ] Cancel appointment → verify Google Calendar event deleted
- [ ] Change trainer → verify event moves between calendars
- [ ] Disconnect → verify status resets, future syncs stop
- [ ] Deny OAuth consent → verify graceful error
- [ ] Revoke access in Google settings → verify error display on next sync

## Migration Plan

### New Tables
1. `google_calendar_connections` — created in tenant DB migration
2. `google_calendar_event_mappings` — created in same migration

### New Column
1. `appointments.google_calendar_event_id` — nullable text, no data migration needed

### Migration SQL (approximate)
```sql
CREATE TABLE IF NOT EXISTS "google_calendar_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "token_expires_at" timestamp with time zone NOT NULL,
  "google_email" text NOT NULL,
  "calendar_id" text NOT NULL DEFAULT 'primary',
  "sync_scope" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_sync_at" timestamp with time zone,
  "last_sync_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "gcal_connections_member_idx" ON "google_calendar_connections" ("member_id");
CREATE INDEX "gcal_connections_active_idx" ON "google_calendar_connections" ("is_active");
CREATE INDEX "gcal_connections_scope_idx" ON "google_calendar_connections" ("sync_scope");

CREATE TABLE IF NOT EXISTS "google_calendar_event_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "appointment_id" uuid NOT NULL REFERENCES "appointments"("id") ON DELETE CASCADE,
  "connection_id" uuid NOT NULL REFERENCES "google_calendar_connections"("id") ON DELETE CASCADE,
  "google_event_id" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "gcal_event_map_appt_conn_idx" ON "google_calendar_event_mappings" ("appointment_id", "connection_id");
CREATE INDEX "gcal_event_map_appt_idx" ON "google_calendar_event_mappings" ("appointment_id");
CREATE INDEX "gcal_event_map_conn_idx" ON "google_calendar_event_mappings" ("connection_id");

ALTER TABLE "appointments" ADD COLUMN "google_calendar_event_id" text;
```

### Rollback Strategy

**Phase 1 rollback:**
- Remove route from `apps/server/src/index.ts`
- Remove router from `packages/api/src/routers/index.ts`
- Tables can remain (empty, no data loss)
- Remove sidebar link

**Phase 2 rollback:**
- Revert sync calls in `appointments.ts` router
- Existing Google Calendar events will remain (orphaned but harmless)
- Connection rows remain valid for re-enabling later

**No destructive rollback needed** — the feature is additive and all changes are backward-compatible.

## Performance Considerations

### Google API Latency
- Google Calendar API calls add ~200-500ms per request
- **Mitigation:** Fire-and-forget pattern — sync happens after response is sent to client
- For appointments with multiple connections (1 trainer + N admins), API calls are sequential per connection but don't block the main request

### Database Queries
- `findRelevantConnections()` runs on every appointment create/update
- **Optimization:** Index on `isActive` + `syncScope` ensures fast lookup
- Typically very few connections per tenant (handful of trainers + a few admins)

### Token Refresh
- Proactive refresh when token expires within 5 minutes
- Avoids double-request on every API call (check expiry → refresh → retry)
- Refresh adds ~200ms but only happens once per hour

## Security Considerations

### Token Storage
- OAuth tokens stored in tenant DB as plain text (same security model as other sensitive tenant data like Stripe keys)
- Tenant DB isolation ensures tokens are per-organization
- **Future improvement:** Encrypt tokens at rest using a per-tenant encryption key

### State Parameter
- OAuth state uses `btoa(JSON.stringify({...}))` — not signed
- **Risk:** State could be tampered with to redirect to a different org
- **Mitigation for v1:** Verify that the userId in the state matches the authenticated session. The session is already verified via Better-Auth cookies.
- **Future improvement:** Sign the state with HMAC using `BETTER_AUTH_SECRET`

### Redirect URI
- Strictly configured in Google Cloud Console
- Callback validates state and session before storing tokens

## Open Questions / Risks

1. **Google Cloud Console project** — Does the team already have a GCP project? Or do we need to create one? The OAuth consent screen review process takes time for external-facing apps.

2. **Token encryption** — For v1, tokens are stored as plain text. This is acceptable if the tenant DB is already trusted with sensitive data (Stripe keys, etc.). Should we add encryption before shipping to production?

3. **Timezone handling** — Currently hardcoded to `Asia/Kuala_Lumpur`. Should this be configurable per organization? The `organizationSettings` key-value store could hold a `timezone` setting.

4. **Rate limits** — Google Calendar API has a quota of ~1,000,000 queries/day and ~500 queries/100 seconds per user. For a typical fitness franchise, this is more than sufficient. No rate limiting needed in v1.

5. **Historical backfill** — When a trainer connects, should we push existing future appointments to their calendar? This is excluded from v1 scope but is a natural follow-up. The sync orchestrator would need a `backfillForConnection(connectionId)` function.

6. **Multiple Google accounts** — Current design allows one Google account per member. Should we support connecting multiple calendars? Excluded from v1.
