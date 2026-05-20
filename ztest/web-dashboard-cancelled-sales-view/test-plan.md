# Test Plan: Cancelled Sales View (Redirect)

**Route:** `/dashboard/cancelled-sales/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to sales view
**Trigger:** Navigate to `/dashboard/cancelled-sales/view`
**Steps:**
1. Log in, navigate to route
**Expected:**
- `redirect()` fires in `beforeLoad`
- Navigates to `/dashboard/sales/view`
- Sales page loads (All tab, unfiltered)

### TC-02: No component rendered
**Expected:**
- Component is `() => null`; pure redirect

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect stub; cancelled sales are now visible within the main sales view
