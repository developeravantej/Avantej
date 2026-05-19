# Test Plan: Role View (Legacy Redirect)

**Route:** `/dashboard/access-control/role/$id` (actual file: `/dashboard/role/view`)
**Auth required:** yes
**Last round:** 1

## Preconditions
- App running at localhost:3001
- User logged in

## Test Cases

### TC-01: Legacy route redirects to roles tab
**Trigger:** Navigate to `/dashboard/role/view`
**Steps:**
1. Log in, navigate to `/dashboard/role/view`
**Expected:**
- `makeTabRedirect` runs in `beforeLoad`
- Redirects to `/dashboard/access-control/roles?tab=roles`
- Roles page loads with "roles" tab active
- No "page not found" error

### TC-02: Route is marked as LEGACY
**Trigger:** Code inspection
**Expected:**
- File has comment "LEGACY — slated for rewrite; do not extend"
- No component rendered (component is a stub redirect)

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Edge Cases

### EC-01: Redirect chain
**Setup:** User navigates directly to legacy URL
**Expected:** Single redirect to canonical URL; no redirect loops

## Known Gaps
- This is a pure redirect stub; no UI to test
