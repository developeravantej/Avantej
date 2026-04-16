# Technical Architecture

## System Design

```
┌─────────────────┐     OAuth2 Redirect     ┌─────────────────────┐
│  Settings Page   │ ──────────────────────→ │  Google Consent      │
│  (Frontend)      │ ←────────────────────── │  Screen              │
└─────────────────┘     Callback w/ code     └─────────────────────┘
        │                                              │
        │ POST /rpc/googleCalendar/status              │ GET /auth/google-calendar/callback?code=...
        │ POST /rpc/googleCalendar/disconnect           │
        ▼                                              ▼
┌─────────────────┐                          ┌─────────────────────┐
│  oRPC Router     │                          │  Hono Route          │
│  (status,        │                          │  (initiate,          │
│   disconnect)    │                          │   callback)          │
└────────┬────────┘                          └──────────┬──────────┘
         │                                              │
         ▼                                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  google-calendar.service.ts                                       │
│  - exchangeCodeForTokens(code)                                    │
│  - refreshAccessToken(refreshToken)                               │
│  - createCalendarEvent(accessToken, event)                        │
│  - updateCalendarEvent(accessToken, eventId, event)               │
│  - deleteCalendarEvent(accessToken, eventId)                      │
│  - revokeTokens(accessToken)                                      │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│  google_calendar_connections (tenant DB table)                     │
│  Per-member row: tokens, scope, calendarId, last sync status      │
└──────────────────────────────────────────────────────────────────┘
```

## Key Technical Decisions

### 1. Raw `fetch` — NOT `googleapis` npm package

**Why:** The server targets Cloudflare Workers (`apps/server/src/lib/better-auth.ts` uses `neonConfig.webSocketConstructor = ws` and `cloudflare:workers` env). The `googleapis` package depends on Node.js built-ins (`fs`, `child_process`) that don't exist on Workers. All Google API calls use direct `fetch` to REST endpoints.

### 2. Per-member token storage in tenant DB

**Why:** Each trainer/admin connects their own Google account. Tokens are organization-scoped data (different orgs = different connections), so they belong in the tenant DB, not the control panel DB. The `organizationSettings` table is a flat key-value store — OAuth tokens need structured fields (access_token, refresh_token, expiry, calendar_id).

### 3. One-way push, fire-and-forget

**Why:** Google Calendar sync is a convenience feature. If the Google API call fails, the appointment must still succeed. Sync errors are logged and surfaced on the settings page ("last sync failed") but never block the booking flow.

### 4. OAuth callback as Hono route (not oRPC)

**Why:** Google redirects the browser to the callback URL. This must be a standard GET route, not an oRPC POST procedure. Placed alongside existing auth routes at `/auth/google-calendar/callback`.

### 5. Sync scope based on member role

- `role === "admin"` → `syncScope: "all"` — events created for ALL appointments in accessible hierarchy nodes
- `role === "trainer"` → `syncScope: "own"` — events created only when `appointment.trainerId === member.id`

---

## Data Model — New Table

### `google_calendar_connections` (tenant schema)

```typescript
// packages/db/src/schema/tenant/google-calendar-connections.ts

import { pgTable, uuid, text, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { members } from "./members";

export const googleCalendarConnections = pgTable("google_calendar_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  
  // OAuth tokens (encrypted at rest via application layer)
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  
  // Google account info
  googleEmail: text("google_email").notNull(),
  calendarId: text("calendar_id").notNull().default("primary"),
  
  // Sync configuration
  syncScope: text("sync_scope").notNull(), // "all" | "own"
  isActive: boolean("is_active").default(true).notNull(),
  
  // Status tracking
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

**Key constraints:**
- One connection per member (`uniqueIndex` on `memberId`)
- `cascade` delete — if member is removed, connection is cleaned up
- `syncScope` determined at connection time based on member role

### Add to `appointments` table

```typescript
// New column on existing appointments table
googleCalendarEventId: text("google_calendar_event_id"),
```

This stores the Google Calendar event ID per appointment, enabling update/delete operations.

---

## API Contracts

### Hono Routes (OAuth Flow)

#### `GET /auth/google-calendar/initiate`

Redirects to Google OAuth consent screen.

**Query params:**
```
?organizationId=<uuid>&returnUrl=<encoded-url>
```

**Response:** `302 Redirect` to `https://accounts.google.com/o/oauth2/v2/auth?...`

**State param** (base64-encoded JSON):
```json
{
  "organizationId": "996febce-...",
  "userId": "user-id-from-session",
  "returnUrl": "/dashboard/settings/google-calendar"
}
```

#### `GET /auth/google-calendar/callback`

Handles Google's redirect after user consent.

**Query params (from Google):**
```
?code=<auth-code>&state=<base64-state>
```

**Logic:**
1. Decode state → extract organizationId, userId
2. Exchange code for tokens via `POST https://oauth2.googleapis.com/token`
3. Fetch user info via `GET https://www.googleapis.com/oauth2/v2/userinfo` to get email
4. Look up member in tenant DB by userId
5. Determine syncScope from member.role
6. Insert/upsert `google_calendar_connections` row
7. Redirect to `returnUrl` with `?gcal=connected` query param

**Error:** Redirect to `returnUrl?gcal=error&message=<encoded-error>`

### oRPC Procedures

#### `googleCalendar.status`

```typescript
input: z.object({ organizationId: z.string().uuid() })
output: {
  connected: boolean;
  googleEmail: string | null;
  syncScope: "all" | "own" | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
} | null
```

#### `googleCalendar.disconnect`

```typescript
input: z.object({ organizationId: z.string().uuid() })
output: { success: boolean }
```

Revokes Google token, deletes the connection row.

---

## Google API Endpoints Used (via raw `fetch`)

| Operation | Method | URL |
|-----------|--------|-----|
| Exchange auth code | POST | `https://oauth2.googleapis.com/token` |
| Refresh access token | POST | `https://oauth2.googleapis.com/token` |
| Get user info | GET | `https://www.googleapis.com/oauth2/v2/userinfo` |
| Create calendar event | POST | `https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events` |
| Update calendar event | PUT | `https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}` |
| Delete calendar event | DELETE | `https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}` |
| Revoke token | POST | `https://oauth2.googleapis.com/revoke?token={token}` |

---

## Environment Variables (New)

```
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google-calendar/callback
```

These go in `apps/server/.env` (and Cloudflare Workers secrets for production).
