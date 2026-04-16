# Phased Implementation

## Phase 1: Schema + OAuth Flow + Settings Page (Delivers Journey 1 & 2)

**Goal:** A trainer or admin can connect/disconnect their Google Calendar from the settings page. No sync yet.

### Task 1.1: Create `google_calendar_connections` tenant schema

**Files:**
- **Create** `packages/db/src/schema/tenant/google-calendar-connections.ts`
- **Modify** `packages/db/src/schema/tenant/index.ts` — add export

```typescript
// packages/db/src/schema/tenant/google-calendar-connections.ts
import { pgTable, uuid, text, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { members } from "./members";

export const googleCalendarConnections = pgTable("google_calendar_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  googleEmail: text("google_email").notNull(),
  calendarId: text("calendar_id").notNull().default("primary"),
  syncScope: text("sync_scope").notNull(), // "all" | "own"
  isActive: boolean("is_active").default(true).notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  memberIdUniqueIdx: uniqueIndex("gcal_connections_member_idx").on(table.memberId),
  isActiveIdx: index("gcal_connections_active_idx").on(table.isActive),
  syncScopeIdx: index("gcal_connections_scope_idx").on(table.syncScope),
}));
```

**Also:**
- Run `bun db:generate` to create migration
- Embed migration in `packages/db/src/migrate-tenant.ts` (following the existing `MIGRATION_XXXX` pattern)
- Run `bun db:push` to verify

### Task 1.2: Add `googleCalendarEventId` column to appointments

**Files:**
- **Modify** `packages/db/src/schema/tenant/appointments.ts` — add column:

```typescript
googleCalendarEventId: text("google_calendar_event_id"),
```

No index needed yet (only looked up when we already have the appointment).

Generate migration alongside Task 1.1.

### Task 1.3: Create Google Calendar service (token exchange + revoke only)

**Files:**
- **Create** `packages/services/src/google-calendar.service.ts`
- **Modify** `packages/services/src/index.ts` — add exports

```typescript
// packages/services/src/google-calendar.service.ts

// Environment-agnostic (uses global fetch, no Node.js deps)

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;  // Only on initial exchange, not on refresh
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleUserInfo {
  email: string;
  name?: string;
}

export function getGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return res.json();
}

export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`User info fetch failed: ${await res.text()}`);
  return res.json();
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  // Don't throw on revoke failure — token may already be invalid
}
```

### Task 1.4: Create OAuth Hono routes (initiate + callback)

**Files:**
- **Create** `apps/server/src/routes/google-calendar.ts`
- **Modify** `apps/server/src/index.ts` — mount route: `app.route("/auth/google-calendar", googleCalendarRoutes)`

```typescript
// apps/server/src/routes/google-calendar.ts
import { Hono } from "hono";
import { getBetterAuth } from "@/lib/better-auth";
import { getControlPanelDb } from "@/lib/db";
import {
  exchangeCodeForTokens,
  getGoogleAuthUrl,
  getGoogleUserInfo,
} from "@avantej-core/services";
import { googleCalendarConnections } from "@avantej-core/db/schema/tenant/google-calendar-connections";
import { members } from "@avantej-core/db/schema/tenant/members";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { eq } from "drizzle-orm";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

const app = new Hono();

// GET /auth/google-calendar/initiate
app.get("/initiate", async (c) => {
  // 1. Verify session
  const auth = getBetterAuth(c);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.redirect("/login");

  const organizationId = c.req.query("organizationId");
  const returnUrl = c.req.query("returnUrl") || "/dashboard/settings/google-calendar";
  if (!organizationId) return c.text("Missing organizationId", 400);

  // 2. Build state (signed/encoded)
  const state = btoa(JSON.stringify({
    organizationId,
    userId: session.user.id,
    returnUrl,
  }));

  // 3. Redirect to Google
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
  const url = getGoogleAuthUrl({ clientId, redirectUri, state });
  return c.redirect(url);
});

// GET /auth/google-calendar/callback
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const error = c.req.query("error");

  if (error || !code || !stateParam) {
    // Google returned an error or user denied
    return c.redirect("/dashboard/settings/google-calendar?gcal=error&message=auth_denied");
  }

  let state: { organizationId: string; userId: string; returnUrl: string };
  try {
    state = JSON.parse(atob(stateParam));
  } catch {
    return c.redirect("/dashboard/settings/google-calendar?gcal=error&message=invalid_state");
  }

  try {
    // 1. Exchange code for tokens
    const tokens = await exchangeCodeForTokens({
      code,
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: process.env.GOOGLE_REDIRECT_URI!,
    });

    // 2. Get Google user info
    const userInfo = await getGoogleUserInfo(tokens.access_token);

    // 3. Connect to tenant DB and find member
    // (follow existing pattern from orpc-tenant.middleware.ts)
    const controlPanelDb = getControlPanelDb(c);
    // ... look up org → get neon branch → connect tenant DB
    // (implementation mirrors orpcTenantMiddleware tenant DB setup)

    // 4. Find member by userId
    const member = await tenantDb.query.members.findFirst({
      where: eq(members.userId, state.userId),
    });
    if (!member) throw new Error("Member not found");

    // 5. Determine sync scope
    const syncScope = member.role === "admin" ? "all" : "own";

    // 6. Upsert connection
    await tenantDb
      .insert(googleCalendarConnections)
      .values({
        memberId: member.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token!,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        googleEmail: userInfo.email,
        syncScope,
      })
      .onConflictDoUpdate({
        target: googleCalendarConnections.memberId,
        set: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token!,
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          googleEmail: userInfo.email,
          syncScope,
          isActive: true,
          lastSyncError: null,
          updatedAt: new Date(),
        },
      });

    return c.redirect(`${state.returnUrl}?gcal=connected`);
  } catch (err) {
    console.error("Google Calendar OAuth callback error:", err);
    return c.redirect(`${state.returnUrl}?gcal=error&message=token_exchange_failed`);
  }
});

export default app;
```

**Note on tenant DB access in the callback:** The callback route needs tenant DB access but is NOT an oRPC procedure. It must manually replicate the tenant DB connection logic from `orpc-tenant.middleware.ts`:
1. Look up org in control panel DB to get `neonBranchId`
2. Build connection string for the tenant branch
3. Create drizzle client

Extract this into a shared helper function `getTenantDbForOrg(controlPanelDb, organizationId)` in `packages/services/src/tenant-db.service.ts` or similar, so both the middleware and this route can use it.

### Task 1.5: Create oRPC router for status + disconnect

**Files:**
- **Create** `packages/api/src/routers/google-calendar.ts`
- **Modify** `packages/api/src/routers/index.ts` — add to `baseRouter`

```typescript
// packages/api/src/routers/google-calendar.ts
import { protectedProcedure } from "../index";
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { googleCalendarConnections } from "@avantej-core/db/schema/tenant/google-calendar-connections";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq, and } from "drizzle-orm";
import { revokeGoogleToken } from "@avantej-core/services";

export const googleCalendarRouter = {
  status: protectedProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .handler(async ({ context }) => {
      if (!context.tenantDb) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "No tenant DB" });
      if (!context.member) throw new ORPCError("FORBIDDEN", { message: "Not a member" });

      const connection = await context.tenantDb.query.googleCalendarConnections.findFirst({
        where: eq(googleCalendarConnections.memberId, context.member.id),
      });

      if (!connection) return { connected: false, googleEmail: null, syncScope: null, lastSyncAt: null, lastSyncError: null };

      return {
        connected: connection.isActive,
        googleEmail: connection.googleEmail,
        syncScope: connection.syncScope as "all" | "own",
        lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
        lastSyncError: connection.lastSyncError,
      };
    }),

  disconnect: protectedProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .handler(async ({ context }) => {
      if (!context.tenantDb) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "No tenant DB" });
      if (!context.member) throw new ORPCError("FORBIDDEN", { message: "Not a member" });

      const connection = await context.tenantDb.query.googleCalendarConnections.findFirst({
        where: eq(googleCalendarConnections.memberId, context.member.id),
      });

      if (!connection) throw new ORPCError("NOT_FOUND", { message: "No connection found" });

      // Revoke Google token (best-effort)
      await revokeGoogleToken(connection.accessToken).catch(() => {});

      // Delete connection
      await context.tenantDb
        .delete(googleCalendarConnections)
        .where(eq(googleCalendarConnections.id, connection.id));

      return { success: true };
    }),
};
```

### Task 1.6: Create Settings Index + Google Calendar Page

**Files:**
- **Create** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/google-calendar.tsx`
- **Modify** `apps/web/src/components/app-sidebar.tsx` — add "Google Calendar" under Config section

```typescript
// apps/web/src/routes/_authenticated/dashboard/_layout/settings/google-calendar.tsx
// Key elements:
// - Status card showing connected/disconnected state
// - "Connect Google Calendar" button → navigates to /auth/google-calendar/initiate
// - When connected: shows googleEmail, syncScope badge, lastSyncAt, disconnect button
// - On mount: reads ?gcal= query param for toast notifications
// - Uses client.googleCalendar.status() for data
// - Uses client.googleCalendar.disconnect() mutation
```

**UI Layout:**
```
┌─────────────────────────────────────────────────┐
│ Google Calendar Integration                      │
│ Sync your appointments to Google Calendar        │
│                                                  │
│ ┌─────────────────────────────────────────────┐  │
│ │ Status: ● Connected / ○ Not Connected       │  │
│ │ Google Account: trainer@gmail.com           │  │
│ │ Sync Scope: [Your appointments]             │  │
│ │ Last Synced: 5 minutes ago                  │  │
│ │                                             │  │
│ │ [Disconnect]                                │  │
│ └─────────────────────────────────────────────┘  │
│                                                  │
│ OR (when not connected):                         │
│                                                  │
│ ┌─────────────────────────────────────────────┐  │
│ │ Connect your Google Calendar to             │  │
│ │ automatically sync appointments.            │  │
│ │                                             │  │
│ │ [Connect Google Calendar]                   │  │
│ └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Task 1.7: Update sidebar navigation

**File:** `apps/web/src/components/app-sidebar.tsx`

Add "Google Calendar" link under the Settings → Config collapsible, alongside "Tax Rates":

```typescript
{
  title: "Google Calendar",
  url: "/dashboard/settings/google-calendar",
}
```

### Acceptance Criteria (Phase 1)

- [ ] Trainer can click "Connect Google Calendar" → completes OAuth flow → sees "Connected" status with their Google email
- [ ] Admin can do the same → sees syncScope as "All appointments"
- [ ] Member can disconnect → status returns to "Not connected"
- [ ] Settings page accessible from sidebar under Settings → Config → Google Calendar
- [ ] OAuth errors handled gracefully (denied consent, invalid state, token failure)

### Dependencies

- Google Cloud Console project with Calendar API enabled
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` environment variables set

---

## Phase 2: Appointment → Google Calendar Push (Delivers Journey 3 & 4)

**Goal:** When appointments are created/updated/cancelled, events are pushed to connected members' Google Calendars.

### Task 2.1: Add Calendar event CRUD to service

**File:** `packages/services/src/google-calendar.service.ts` — extend with:

```typescript
interface CalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEvent,
): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    },
  );
  if (!res.ok) throw new Error(`Create event failed: ${await res.text()}`);
  const data = await res.json();
  return data.id; // Google Calendar event ID
}

export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<CalendarEvent>,
): Promise<void> { /* PUT request */ }

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> { /* DELETE request */ }
```

### Task 2.2: Create sync orchestrator

**File:** **Create** `packages/services/src/google-calendar-sync.service.ts`

This is the core logic that decides WHO to sync to and WHAT to sync:

```typescript
export async function syncAppointmentToGoogleCalendar(
  tenantDb: TenantDb,
  appointment: AppointmentRow,
  action: "create" | "update" | "delete",
  config: { clientId: string; clientSecret: string },
): Promise<void> {
  // 1. Find all active connections that should receive this event
  const connections = await findRelevantConnections(tenantDb, appointment);
  
  // 2. For each connection, push the event
  for (const conn of connections) {
    try {
      const accessToken = await ensureValidToken(tenantDb, conn, config);
      
      if (action === "create") {
        const eventId = await createCalendarEvent(accessToken, conn.calendarId, buildEvent(appointment));
        // Store eventId — see Task 2.3 for tracking approach
      } else if (action === "update") {
        await updateCalendarEvent(accessToken, conn.calendarId, existingEventId, buildEvent(appointment));
      } else if (action === "delete") {
        await deleteCalendarEvent(accessToken, conn.calendarId, existingEventId);
      }
      
      await updateSyncStatus(tenantDb, conn.id, { lastSyncAt: new Date(), lastSyncError: null });
    } catch (err) {
      await updateSyncStatus(tenantDb, conn.id, { lastSyncError: String(err) });
      // Don't throw — sync failure must not block the appointment operation
    }
  }
}

function findRelevantConnections(tenantDb, appointment) {
  // Query: connections WHERE
  //   (syncScope = "own" AND memberId = appointment.trainerId) OR
  //   (syncScope = "all" AND isActive = true)
  // For "all" scope, additionally filter by hierarchy access (admin's accessible nodes include appointment.branchId)
}

function buildEvent(appointment): CalendarEvent {
  return {
    summary: `${appointment.serviceName} - ${appointment.type}`,
    description: [
      appointment.bookingNumber && `Booking: ${appointment.bookingNumber}`,
      appointment.notes,
    ].filter(Boolean).join("\n"),
    location: appointment.location || appointment.branchName,
    start: { dateTime: appointment.startTime.toISOString(), timeZone: "Asia/Kuala_Lumpur" },
    end: { dateTime: appointment.endTime.toISOString(), timeZone: "Asia/Kuala_Lumpur" },
  };
}
```

### Task 2.3: Create event tracking table (or JSON column)

**Decision:** Since one appointment can create events in multiple Google Calendars (the trainer + multiple admins), we need a many-to-many mapping.

**Option A (recommended):** New table `google_calendar_event_mappings`

```typescript
// packages/db/src/schema/tenant/google-calendar-event-mappings.ts
export const googleCalendarEventMappings = pgTable("google_calendar_event_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id")
    .notNull()
    .references(() => appointments.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => googleCalendarConnections.id, { onDelete: "cascade" }),
  googleEventId: text("google_event_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  appointmentConnectionIdx: uniqueIndex("gcal_event_map_appt_conn_idx")
    .on(table.appointmentId, table.connectionId),
  appointmentIdx: index("gcal_event_map_appt_idx").on(table.appointmentId),
  connectionIdx: index("gcal_event_map_conn_idx").on(table.connectionId),
}));
```

**This replaces the simpler `googleCalendarEventId` column on appointments** from Task 1.2. We still add that column as a quick lookup for the common single-trainer case, but the mapping table is the source of truth.

**Update Task 1.2:** Keep `googleCalendarEventId` on appointments as a nullable denormalized shortcut, but add this mapping table in Phase 2.

### Task 2.4: Wire sync into appointment router

**Files:**
- **Modify** `packages/api/src/routers/appointments.ts` — add sync calls after create/update

```typescript
// In the create handler, after successful DB insert:
// Fire-and-forget — don't await, don't block
syncAppointmentToGoogleCalendar(context.tenantDb, appointment, "create", {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
}).catch(err => console.error("GCal sync error:", err));

// In the update handler, after successful DB update:
if (input.status === "cancelled") {
  syncAppointmentToGoogleCalendar(context.tenantDb, appointment, "delete", config).catch(...);
} else {
  syncAppointmentToGoogleCalendar(context.tenantDb, appointment, "update", config).catch(...);
}
```

**Important:** The sync function reads env vars for Google credentials. In the oRPC router (which runs on the server), these are accessible via `process.env` or Cloudflare Workers `env`. Pass them as config params rather than reading inside the service (keeps the service environment-agnostic).

### Task 2.5: Implement token refresh with retry

**File:** `packages/services/src/google-calendar-sync.service.ts`

```typescript
async function ensureValidToken(
  tenantDb: TenantDb,
  connection: GoogleCalendarConnection,
  config: { clientId: string; clientSecret: string },
): Promise<string> {
  // If token expires within 5 minutes, refresh proactively
  if (connection.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
    const refreshed = await refreshAccessToken({
      refreshToken: connection.refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    
    await tenantDb
      .update(googleCalendarConnections)
      .set({
        accessToken: refreshed.access_token,
        tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.id, connection.id));
    
    return refreshed.access_token;
  }
  
  return connection.accessToken;
}
```

### Acceptance Criteria (Phase 2)

- [ ] Creating an appointment for a connected trainer creates a Google Calendar event
- [ ] Creating an appointment creates events for all connected admins with matching hierarchy scope
- [ ] Updating an appointment time/details updates the Google Calendar event
- [ ] Cancelling an appointment deletes the Google Calendar event
- [ ] Expired tokens are automatically refreshed
- [ ] Sync failures don't block appointment operations (fire-and-forget)
- [ ] Settings page shows updated `lastSyncAt` after sync

### Dependencies

- Phase 1 complete
- Google Cloud Console Calendar API enabled

---

## Phase 3: Edge Cases + Polish (Delivers Journey 5 & 6)

**Goal:** Handle trainer reassignment, disconnect cleanup, error display, and token revocation edge cases.

### Task 3.1: Handle trainer reassignment

When `appointment.trainerId` changes:
1. Delete event from OLD trainer's Google Calendar (if connected)
2. Create event in NEW trainer's Google Calendar (if connected)
3. Admin calendars: update event (don't delete/recreate)

**File:** Modify `packages/services/src/google-calendar-sync.service.ts` — add `trainerChanged` logic.

### Task 3.2: Handle connection deactivation on token revocation

When a refresh attempt fails with a `400` or `401` (user revoked access in Google settings):
1. Set `isActive: false` on the connection
2. Set `lastSyncError: "Access revoked. Please reconnect."`
3. Stop trying to sync for this connection

**File:** `packages/services/src/google-calendar-sync.service.ts`

Settings page already displays `lastSyncError`, so the user sees the issue and can reconnect.

### Task 3.3: Settings page polish

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/google-calendar.tsx`

- Show `lastSyncError` as an alert/warning banner when present
- Add "Reconnect" button when `connected: true` but `lastSyncError` contains "revoked"
- Show relative time for `lastSyncAt` (e.g., "5 minutes ago")
- Loading skeleton while status is fetching

### Task 3.4: Unit tests

**Files:**
- **Create** `apps/server/src/tests/unit/services/google-calendar.test.ts`
  - Test `getGoogleAuthUrl` generates correct URL with all params
  - Test `buildEvent` formats appointment data correctly
  - Test `findRelevantConnections` returns correct connections based on scope
  - Test `ensureValidToken` refreshes when token is near expiry
  - Mock `fetch` for Google API calls

### Acceptance Criteria (Phase 3)

- [ ] Changing a trainer on an appointment moves the event between calendars
- [ ] If user revokes Google access, settings page shows error + reconnect option
- [ ] Unit tests pass for service functions
- [ ] No sync failures silently lost — all errors captured in `lastSyncError`
