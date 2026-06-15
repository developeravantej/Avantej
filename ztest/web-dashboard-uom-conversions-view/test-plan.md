# Test Plan: UOM Conversions View (Redirect)

**Route:** `/dashboard/uom-conversions/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to uom conversions tab
**Trigger:** Navigate to `/dashboard/uom-conversions/view`
**Steps:**
1. Log in, navigate to route
**Expected:**
- `makeTabRedirect` runs in `beforeLoad`
- Redirects to `/dashboard/uom/view?tab=conversions`
- Conversions tab active

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect stub
