# Test Plan: Package Instances View (Legacy Redirect)

**Route:** `/dashboard/packages/instances/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to packages session-packs tab
**Trigger:** Navigate to `/dashboard/packages/instances/view`
**Steps:**
1. Log in, navigate to route
**Expected:**
- `makeTabRedirect` runs in `beforeLoad`
- Redirects to `/dashboard/packages/view?tab=session-packs`
- Session packs tab active

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect stub; package instances are managed in packages/view
