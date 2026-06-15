# Test Plan: Rooms View (Redirect)

**Route:** `/dashboard/rooms/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to service/rooms tab
**Trigger:** Navigate to `/dashboard/rooms/view`
**Steps:**
1. Log in, navigate to route
**Expected:**
- `redirect()` fires in `beforeLoad`
- Navigates to `/dashboard/service/view?tab=rooms`
- Service page loads with rooms tab active

### TC-02: No component rendered
**Expected:**
- Component is `() => null`; no UI rendered at this route

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect stub
