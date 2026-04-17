# Google Calendar Integration

**Route:** `/_authenticated/dashboard/_layout/settings/google-calendar`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/google-calendar.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Connect or disconnect the logged-in member's Google Calendar so appointments are automatically synced.
**Produces:** A card showing connection status (connected/not connected), Google account email, sync scope badge, last sync time, last sync error alert, and a Connect / Disconnect button.
**On success:** Connect → OAuth redirect to Google consent screen, then back with `?gcal=connected` → success toast. Disconnect → token revoked, connection row deleted → success toast.
**On failure / error states:** Loading → Skeleton cards. API error → fallback card "Failed to load connection status. Please refresh." Auth denied → `?gcal=error&message=auth_denied` → error toast. Invalid OAuth state → `?gcal=error&message=invalid_state` → error toast.

---

## 2. How It Works

**Execution flow:**
```
GoogleCalendarPage
  → useUserContext() → organizationId
  → Route.useSearch() → { gcal, message } (OAuth redirect params)
  → useEffect: show toast if gcal === "connected" | "error"
  → useQuery(["googleCalendar", "status", orgId])
      → client.googleCalendar.status({ organizationId })
        → googleCalendarRouter.status
          → tenantDb.googleCalendarConnections WHERE memberId = member.id

  → "Connect" button → handleConnect()
      → window.location.href = /auth/google-calendar/initiate?organizationId=...&returnUrl=...
        → [server] GET /auth/google-calendar/initiate → getGoogleAuthUrl → redirect to Google
        → [Google] user consents → GET /auth/google-calendar/callback
          → exchangeCodeForTokens → getGoogleUserInfo
          → upsert googleCalendarConnections row (memberId, accessToken, refreshToken, googleEmail, syncScope)
          → redirect to returnUrl?gcal=connected

  → "Disconnect" button → window.confirm → disconnectMutation
      → client.googleCalendar.disconnect({ organizationId })
        → googleCalendarRouter.disconnect
          → revokeGoogleToken (best-effort)
          → DELETE googleCalendarConnections WHERE id = connection.id
```

**Inputs:**
- `organizationId` from user context
- Search params: `gcal` (`"connected"` | `"error"`), `message` (error code string)
- Validated via Zod in `validateSearch`

**State management:**
- TanStack Query: `["googleCalendar", "status", organizationId]`
- `disconnectMutation` — `useMutation`
- No local form state (connect is a page redirect, disconnect is a confirm dialog)

**Outputs:** Card with status details; toast notifications on mount (OAuth redirect result).
**Side effects:** Disconnect invalidates `["googleCalendar", "status", organizationId]`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `googleCalendar.status` — read connection status for current member (`packages/api/src/routers/google-calendar.ts`)
- `googleCalendar.disconnect` — revoke token and delete connection row
- `GET /auth/google-calendar/initiate` — Hono route that initiates OAuth (`apps/server/src/routes/google-calendar.ts`)
- `GET /auth/google-calendar/callback` — Hono route that handles OAuth callback

**Uses these components:**
- `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription` — `@/components/ui/card`
- `Badge`, `Button`, `Alert`, `AlertDescription`, `Skeleton` — `@/components/ui/*`
- `Calendar`, `CheckCircle2`, `XCircle`, `AlertTriangle`, `RefreshCw` — `lucide-react`

**Uses these hooks:**
- `useUserContext` — resolves `organizationId`
- `useQuery`, `useMutation`, `useQueryClient`

**Navigation: who navigates here:**
- App sidebar → Settings → "Google Calendar" (`apps/web/src/components/app-sidebar.tsx`)
- After successful OAuth callback: Google redirects to `/dashboard/settings/google-calendar?gcal=connected`
- After failed OAuth: Google redirects to `/dashboard/settings/google-calendar?gcal=error&message=...`

**Navigation: where it goes:**
- Connect button → `/auth/google-calendar/initiate?organizationId=...&returnUrl=...` (server-side redirect)

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `google_calendar_connections` (tenant) | SELECT | `memberId`, `isActive`, `googleEmail`, `syncScope`, `lastSyncAt`, `lastSyncError`, `accessToken` |
| `google_calendar_connections` (tenant) | INSERT/UPDATE (upsert) | `memberId`, `accessToken`, `refreshToken`, `tokenExpiresAt`, `googleEmail`, `syncScope`, `isActive`, `lastSyncError`, `updatedAt` |
| `google_calendar_connections` (tenant) | DELETE | `id` |
| `members` (tenant) | SELECT | `id`, `userId`, `role` (to determine `syncScope`) |

**Key types:**
```typescript
// status response
{
  connected: boolean;
  googleEmail: string | null;
  syncScope: "all" | "own" | null;  // "all" for admin, "own" for staff
  lastSyncAt: string | null;        // ISO string
  lastSyncError: string | null;
}
```

**Search params schema:**
```typescript
z.object({
  gcal: z.enum(["connected", "error"]).optional(),
  message: z.string().optional(),
})
```

---

## 5. Tests

**Test files:** None found.
**Not tested (risk areas):**
- OAuth redirect flow (requires server environment)
- Toast display on mount from `gcal` search param
- Disconnect confirmation dialog
- `lastSyncError` alert display and "Reconnect" inline button

---

## 6. Notes

- `syncScope` is determined server-side at connection time: `member.role === "admin"` → `"all"` (syncs all appointments), otherwise `"own"` (syncs only the member's appointments).
- Token revocation (`revokeGoogleToken`) is best-effort — the connection row is deleted even if Google returns an error.
- The OAuth state parameter is a base64-encoded JSON `{ organizationId, userId, returnUrl }`. An invalid state (decode failure) redirects with `?gcal=error&message=invalid_state`.
- `returnUrl` defaults to `/dashboard/settings/google-calendar` in the server route if not provided.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` must be set in server env vars for OAuth to work.
- The page uses `window.confirm` for the disconnect confirmation rather than a Dialog — inconsistent with other pages that use shadcn Dialog.
