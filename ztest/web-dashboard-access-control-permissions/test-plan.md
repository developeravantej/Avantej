# Test Plan: Access Control — Permissions (Legacy Redirect)

**Route:** `/dashboard/access-control/permissions`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to roles page permissions tab
**Trigger:** Navigate to `/dashboard/access-control/permissions`
**Steps:**
1. Log in, navigate to the route
**Expected:**
- `makeTabRedirect` runs in `beforeLoad`
- Redirects to `/dashboard/access-control/roles?tab=permissions`
- Permissions tab active on arrival

### TC-02: No component rendered
**Trigger:** Code behavior
**Expected:**
- Route file has no component; pure redirect stub

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect; no UI to test
