# Google Calendar Integration

**Route:** `/dashboard/settings/google-calendar`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/google-calendar.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Connect or disconnect Google Calendar to sync appointments.
**Produces:** Card showing connection status, sync scope, last sync time, and error messages.
**On success:** Toast confirmation; status card updates; calendar syncs appointments automatically.
**On failure / error states:** Loading skeletons, error cards with retry button, sync error alerts.

---

## 2. How It Works

**Execution flow:**
1. Route loads with optional search params (`?gcal=connected|error&message=...`)
2. `useUserContext()` fetches org ID
3. `useQuery` for `client.googleCalendar.status()`
4. If search params present, show toast and clear URL
5. User clicks "Connect" → launches `/auth/google-calendar/initiate?organizationId=X&returnUrl=...`
6. Google OAuth redirect → returns with `gcal` param → toast shown → params cleared

**Inputs:** 
- URL search params: `gcal` (enum: "connected"|"error"), `message` (error type)
- `organizationId` from user context

**State management:** 
- TanStack Query: `["googleCalendar", "status", organizationId]`
- Local state: `saveState` (idle|saving|saved)
- URL params consumed once, then cleared

**Outputs:** 
- Status card (connected/not connected)
- Last sync info (email, scope, timestamp)
- Error message if sync failed
- Disconnect button (destructive)

**Side effects:** 
- Toast notification on OAuth return
- Query invalidation on disconnect
- URL param clearing to prevent remount toasts

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.googleCalendar.status({ organizationId })` — fetch sync status
- `client.googleCalendar.disconnect({ organizationId })` — revoke access
- `/auth/google-calendar/initiate` (external, redirect-based OAuth)

**Uses these components:** 
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` — layout
- `Badge` — scope indicator
- `Alert`, `AlertDescription` — error display
- `Button` — connect/disconnect/retry
- `Skeleton` — loading state
- `lucide-react` icons (Calendar, CheckCircle2, XCircle, AlertTriangle, RefreshCw)

**Uses these hooks:**
- `useUserContext()` — org ID
- `useQuery()` — fetch status
- `useMutation()` — disconnect
- `useQueryClient()` — invalidate
- `useNavigate()` — clear search params
- `useSearch()` — read search params
- `useEffect()` — watch for redirect params, show toast, clear URL

**Navigation: who navigates here:** Settings menu
**Navigation: where it goes:** Nowhere (settings page); OAuth goes to external Google then back here

---

## 4. Data Shapes

**DB tables touched:** None directly (API call)
**Key types / Zod schemas:**
```typescript
// Status response (inferred from code)
{
  connected: boolean;
  syncScope: "all" | "your";  // all appointments vs. only user's
  googleEmail: string | null;
  lastSyncAt: string | null;  // ISO timestamp
  lastSyncError: string | null;
}

// Search params (validated)
{
  gcal?: "connected" | "error";
  message?: string;  // "auth_denied" | "invalid_state" | "token_exchange_failed"
}
```

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):** 
- OAuth redirect flow (toast timing, param clearing)
- Concurrent mutations (multiple disconnect clicks)
- Error state recovery

---

## 6. Notes

**Toast timing fix:** Lines 57–79 show "Fix 1 + 4" — useEffect watches `gcal` param, shows toast once, then clears the param so remounts don't re-fire. Prevents duplicate toasts on page refresh.

**Disable Connect while loading:** Button disabled while `organizationId` is empty or context is loading (Fix 2).

**Retry on error:** Error card includes a "Retry" button (Fix 3) so users don't have to reload the page.

**Token exchange errors:** Explicit error handling for `token_exchange_failed` (Fix 4).

**Sync error reconnect:** If `lastSyncError` exists, shows reconnect button in-line (Fix 5).

No test coverage; manual testing required for OAuth flow.
