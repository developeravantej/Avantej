# Test Plan: Promotions View (Redirect)

**Route:** `/dashboard/promotions/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to service/promotions tab
**Trigger:** Navigate to `/dashboard/promotions/view`
**Steps:**
1. Log in, navigate to route
**Expected:**
- `redirect()` fires in `beforeLoad`
- Navigates to `/dashboard/service/view?tab=promotions`
- Service page loads with promotions tab active

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect stub
