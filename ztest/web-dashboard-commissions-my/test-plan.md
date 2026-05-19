# Test Plan: My Commissions (Legacy Redirect)

**Route:** `/dashboard/commissions/my`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to commissions view mine tab
**Trigger:** Navigate to `/dashboard/commissions/my`
**Steps:**
1. Log in, navigate to route
**Expected:**
- `makeTabRedirect` runs in `beforeLoad`
- Redirects to `/dashboard/commissions/view?tab=mine`
- My Commissions tab active

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect stub
