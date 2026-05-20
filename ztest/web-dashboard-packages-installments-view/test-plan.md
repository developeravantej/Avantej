# Test Plan: Package Installments View (Legacy Redirect)

**Route:** `/dashboard/packages/installments/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to packages installments tab
**Trigger:** Navigate to `/dashboard/packages/installments/view`
**Steps:**
1. Log in, navigate to route
**Expected:**
- `makeTabRedirect` runs in `beforeLoad`
- Redirects to `/dashboard/packages/view?tab=installments`
- Installments tab active

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect stub
