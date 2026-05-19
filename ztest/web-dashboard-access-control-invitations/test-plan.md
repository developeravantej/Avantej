# Test Plan: Access Control — Invitations (Legacy Redirect)

**Route:** `/dashboard/access-control/invitations`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to user-assignment invitations tab
**Trigger:** Navigate to `/dashboard/access-control/invitations`
**Steps:**
1. Log in, navigate to the route
**Expected:**
- `makeTabRedirect` runs in `beforeLoad`
- Redirects to `/dashboard/access-control/user-assignment?tab=invitations`
- Invitations tab active on arrival

### TC-02: No component rendered
**Expected:**
- Route file has no component; pure redirect stub

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect; no UI to test
