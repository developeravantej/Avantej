# Test Plan: Suppliers View (Redirect)

**Route:** `/dashboard/suppliers/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to inventory-options suppliers tab
**Trigger:** Navigate to `/dashboard/suppliers/view`
**Steps:**
1. Log in, navigate to route
**Expected:**
- `makeTabRedirect` runs in `beforeLoad`
- Redirects to `/dashboard/inventory-options?tab=suppliers`
- Suppliers tab active

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect stub
