# User Journeys

## Journey 1: Trainer Connects Google Calendar

**Trigger:** Trainer navigates to Settings → Google Calendar in the sidebar

**Steps:**
1. Trainer sees `/dashboard/settings/google-calendar` page → shows "Google Calendar" heading, description text ("Sync your appointments to Google Calendar"), and a "Connect Google Calendar" button. Status shows "Not connected".
2. Trainer clicks "Connect Google Calendar" → browser navigates to `GET /auth/google-calendar/initiate?organizationId=...&returnUrl=/dashboard/settings/google-calendar`
3. Server redirects to Google OAuth consent screen → trainer sees Google's standard "Allow Avantej to access your Google Calendar?" prompt with their Google account picker
4. Trainer approves → Google redirects to `/auth/google-calendar/callback?code=...&state=...`
5. Server exchanges code for tokens, stores connection, redirects to `/dashboard/settings/google-calendar?gcal=connected`
6. Trainer sees settings page again → now shows "Connected" status with their Google email (e.g., `trainer@gmail.com`), sync scope badge ("Your appointments"), last sync time, and a "Disconnect" button
7. Toast notification: "Google Calendar connected successfully"

**Flow ends:** Trainer's Google Calendar connection is active. Future appointments assigned to this trainer will automatically appear in their Google Calendar.

**Where it lives:** New page `apps/web/src/routes/_authenticated/dashboard/_layout/settings/google-calendar.tsx`. Linked from sidebar under Settings → Config → "Google Calendar".

---

## Journey 2: Admin Connects Google Calendar

**Trigger:** Admin navigates to Settings → Google Calendar

**Steps:**
1. Admin sees the same settings page → "Connect Google Calendar" button
2. Admin clicks connect → same OAuth flow as Journey 1
3. After callback, server detects `member.role === "admin"` → sets `syncScope: "all"`
4. Admin sees settings page → status shows "Connected", scope badge says "All appointments", Google email displayed

**Flow ends:** Admin's Google Calendar will receive ALL appointments within their hierarchy scope.

**Where it lives:** Same page as Journey 1.

**Difference from trainer:** The sync scope badge shows "All appointments" instead of "Your appointments". No extra UI — the scope is auto-determined by role.

---

## Journey 3: Appointment Created → Google Calendar Event Pushed

**Trigger:** Staff/admin creates an appointment via the existing appointment creation flow

**Steps:**
1. User creates appointment via `/dashboard/appointment/view` → appointment form fills in service, trainer, time, branch, etc.
2. User submits → `client.appointments.create(...)` fires → server creates appointment in DB
3. **After successful DB insert**, server checks: does the assigned trainer have an active `google_calendar_connections` row?
4. If yes → server calls Google Calendar API to create event with:
   - Summary: `[Service Name] - [Appointment Type]`
   - Start/end time from appointment
   - Description: notes, booking number, branch name
   - Location: branch/location name
5. Server stores returned `googleCalendarEventId` on the appointment row
6. **Additionally**, server checks: are there any admin connections with `syncScope: "all"` whose accessible nodes include this appointment's branch?
7. If yes → creates events in each connected admin's Google Calendar too (each gets their own event ID — stored as JSON or separate tracking)

**Error handling:** If Google API call fails, log the error and update `lastSyncError` on the connection row. The appointment creation still succeeds. No user-visible error during booking.

**Where it lives:** Backend only — triggered from the existing `appointments.create` procedure in `packages/api/src/routers/appointments.ts`.

---

## Journey 4: Appointment Updated → Google Calendar Event Updated

**Trigger:** Staff/admin updates an appointment (reschedule, change trainer, change status)

**Steps:**
1. User updates appointment → `client.appointments.update(...)` fires
2. After successful DB update, server checks if appointment has a `googleCalendarEventId`
3. If yes and the appointment was updated (time, status, trainer changed):
   - If cancelled → DELETE the Google Calendar event
   - If time/details changed → PATCH/PUT the Google Calendar event
   - If trainer changed → DELETE from old trainer's calendar, CREATE in new trainer's calendar
4. Admin connections with `syncScope: "all"` are also updated

**Where it lives:** Backend only — triggered from the existing `appointments.update` procedure.

---

## Journey 5: Trainer/Admin Disconnects Google Calendar

**Trigger:** Member clicks "Disconnect" on the settings page

**Steps:**
1. Member sees settings page with "Connected" status → clicks "Disconnect" button
2. Confirmation dialog appears: "Are you sure? Future appointments will no longer sync to Google Calendar. Existing events in your calendar will remain."
3. Member confirms → `client.googleCalendar.disconnect(...)` fires
4. Server revokes the Google OAuth token via Google's revocation endpoint
5. Server deletes the `google_calendar_connections` row
6. Server does NOT delete existing Google Calendar events (they remain as historical records)
7. Page refreshes → shows "Not connected" state again
8. Toast: "Google Calendar disconnected"

**Where it lives:** Same settings page, inline action.

---

## Journey 6: Token Refresh (Background, No UI)

**Trigger:** Google access token expires (every ~1 hour)

**Steps:**
1. Server attempts to push an appointment event to Google Calendar
2. Google returns `401 Unauthorized` (token expired)
3. Server uses the stored `refreshToken` to get a new access token from Google
4. Server updates `accessToken` and `tokenExpiresAt` in the DB
5. Server retries the original API call with the new token
6. If refresh also fails (user revoked access via Google settings) → mark connection as `isActive: false`, set `lastSyncError: "Token revoked by user"`

**Where it lives:** Backend only — transparent to the user. The settings page shows `lastSyncError` if refresh failed.
