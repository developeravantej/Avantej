# Test Plan: Categories View (Redirect)

**Route:** `/dashboard/categories/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to inventory-options categories tab
**Trigger:** Navigate to `/dashboard/categories/view`
**Steps:**
1. Log in, navigate to route
**Expected:**
- `makeTabRedirect` runs in `beforeLoad`
- Redirects to `/dashboard/inventory-options?tab=categories`
- Categories tab active

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect stub
