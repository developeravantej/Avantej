# Test Plan: Settings — Google Calendar

**Route:** `/dashboard/settings/google-calendar`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Google Calendar OAuth configured in server
- `client.googleCalendar.getStatus({ organizationId })` available

## Test Cases

### TC-01: Page loads — not connected
**Trigger:** Navigate to `/dashboard/settings/google-calendar` without prior connection
**Steps:**
1. Log in, navigate to route
2. Wait for status load
**Expected:**
- Calendar icon in card header
- Status: "Not Connected" badge (XCircle)
- "Connect Google Calendar" button
- No sync stats shown
- No console errors

### TC-02: Page loads — connected
**Trigger:** Navigate after successful connection
**Steps:**
1. Connect Google Calendar first
2. Navigate to route
**Expected:**
- Status: "Connected" badge (CheckCircle2)
- Last sync time shown (formatted relative time)
- Disconnect button visible
- Sync stats (events synced, etc.)

### TC-03: Loading state
**Trigger:** Observe before status loads
**Expected:**
- Skeleton loader shown for status card

### TC-04: Connect Google Calendar
**Trigger:** Click "Connect Google Calendar"
**Steps:**
1. Navigate (not connected)
2. Click connect button
**Expected:**
- `client.googleCalendar.getAuthUrl({ organizationId })` called
- Browser redirected to Google OAuth URL
- After approval, returns to `/dashboard/settings/google-calendar?gcal=connected`

### TC-05: Return from OAuth — success toast
**Trigger:** Navigate to `?gcal=connected` after OAuth
**Steps:**
1. Return from Google OAuth with `?gcal=connected`
**Expected:**
- useEffect detects `gcal` param
- Toast success shown: "Google Calendar connected successfully" or similar
- URL params cleared (navigate to remove gcal param)

### TC-06: Return from OAuth — error toast
**Trigger:** Navigate to `?gcal=error&message=<msg>` after OAuth failure
**Steps:**
1. Return from OAuth with error params
**Expected:**
- Toast error shown with message
- URL params cleared

### TC-07: Manual sync
**Trigger:** Click "Sync Now" button (if available)
**Steps:**
1. Navigate (connected state)
2. Click sync button
**Expected:**
- `client.googleCalendar.sync({ organizationId })` called
- Loading state on button
- Toast on success/failure
- Last sync time updates

### TC-08: Disconnect Google Calendar
**Trigger:** Click "Disconnect" button
**Steps:**
1. Navigate (connected state)
2. Click disconnect
3. Confirm
**Expected:**
- `client.googleCalendar.disconnect({ organizationId })` called
- Status changes to "Not Connected"
- Connect button re-appears

### TC-09: Error state — status fetch failure
**Trigger:** API error loading status
**Expected:**
- Alert with error details
- Retry possible

### TC-10: Relative time formatting
**Trigger:** Check last sync display
**Expected:**
- `formatRelativeTime()` shows "Just now", "X minutes ago", "X hours ago", "X days ago"
- Null sync time shows "Never"

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.googleCalendar.getStatus({ organizationId })` | TC-01, TC-02, TC-03 |
| `client.googleCalendar.getAuthUrl({ organizationId })` | TC-04 |
| `client.googleCalendar.sync({ organizationId })` | TC-07 |
| `client.googleCalendar.disconnect({ organizationId })` | TC-08 |

## Edge Cases

### EC-01: gcal param with no message on error
**Setup:** Navigate to `?gcal=error` without message param
**Expected:** Generic error message shown; no crash from undefined message

### EC-02: URL cleanup after toast
**Setup:** After showing toast from gcal param
**Expected:** navigate() clears gcal and message params so remounts don't re-fire toast

### EC-03: OAuth redirect loop
**Setup:** User clicks Connect, cancels on Google side
**Expected:** Returns to page; no automatic retry

## Known Gaps
- Exact sync result data (events synced count) not confirmed
- Disconnect confirmation dialog not confirmed in code
- AlertTriangle usage for partial connection state not confirmed
