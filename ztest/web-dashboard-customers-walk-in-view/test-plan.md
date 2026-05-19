# Test Plan: Walk-In Customers View (Legacy Redirect)

**Route:** `/dashboard/customers/walk-in/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to customers registered tab
**Trigger:** Navigate to `/dashboard/customers/walk-in/view`
**Steps:**
1. Log in, navigate to the route
**Expected:**
- `makeTabRedirect` runs in `beforeLoad`
- Redirects to `/dashboard/customers/view?tab=registered`
- Registered customers tab shown

### TC-02: No component rendered
**Expected:**
- Route is a pure redirect stub

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect; no UI to test
- Walk-in customer functionality (from MEMORY.md) now lives within the customers view
