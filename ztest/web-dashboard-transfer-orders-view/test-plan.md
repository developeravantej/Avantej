# Test Plan: Transfer Orders View (Redirect)

**Route:** `/dashboard/transfer-orders/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to stock-requests transfers tab
**Trigger:** Navigate to `/dashboard/transfer-orders/view`
**Steps:**
1. Log in, navigate to route
**Expected:**
- `makeTabRedirect` runs in `beforeLoad`
- Redirects to `/dashboard/stock-requests/view?tab=transfers`
- Transfers tab active

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect stub
