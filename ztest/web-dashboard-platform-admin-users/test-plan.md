# Test Plan: Platform Admin — Users Management

**Route:** `/dashboard/platform-admin/users`
**Auth required:** yes (platform admin)
**Last round:** 1

## Preconditions
- Log in as developer.avantej@gmail.com / password1234
- `client.admin.me({})` returns `{ isPlatformAdmin: true }`
- Route delegates to `UsersTable` component

## Test Cases

### TC-01: Page loads — platform admin
**Trigger:** Navigate as platform admin
**Steps:**
1. Log in as developer.avantej@gmail.com / password1234
2. Navigate to `/dashboard/platform-admin/users`
3. Wait for load
**Expected:**
- "Platform Admin — Users" heading + subtext
- "Manage and impersonate platform users. All actions are audited."
- Search input
- Pagination controls
- UsersTable rendered
- No console errors

### TC-02: Permission guard — non-admin redirect
**Trigger:** Navigate as regular user
**Steps:**
1. Log in as franchisee@gmail.com
2. Navigate to route
**Expected:**
- `client.admin.me({})` check → `isPlatformAdmin === false`
- Redirect to `/dashboard`

### TC-03: Users table — populated
**Trigger:** Wait for data
**Expected:**
- Rows show users: name, email, created date, org count, status
- Actions visible based on role

### TC-04: Search users
**Trigger:** Enter search query (name or email)
**Steps:**
1. Type "test" in search input
**Expected:**
- `useDebounce(search, 300)` delays query
- `client.admin.listUsers({ search: "test", page: 1, limit: 50 })` called
- Table updates with matching users

### TC-05: Search — page resets to 1 on new search
**Trigger:** Navigate to page 2, then type new search
**Steps:**
1. Go to page 2 (if available)
2. Type new search term
**Expected:**
- `handleSearch` calls `setPage(1)`
- Back to page 1 with new search results

### TC-06: Pagination
**Trigger:** Navigate to next page
**Steps:**
1. Click next page button (if visible)
**Expected:**
- `page` state increments
- `client.admin.listUsers({ page: 2, ... })` called
- Next 50 users shown

### TC-07: Role-based admin actions
**Trigger:** Check visible actions based on `usePlatformAdminRole()`
**Steps:**
1. Check what actions are visible for super_admin vs admin role
**Expected:**
- Super admin can see more actions (impersonate, delete, etc.)
- Regular admin sees limited actions

### TC-08: UsersTable component renders
**Trigger:** Wait for users
**Expected:**
- UsersTable shows user rows
- Each row has applicable action buttons

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.admin.me({})` | TC-01, TC-02 |
| `client.admin.listUsers({ search?, page, limit })` | TC-03, TC-04, TC-06 |

## Edge Cases

### EC-01: Re-throw TANSTACK_ROUTER_REDIRECT in catch
**Setup:** Same as admins page
**Expected:** Redirects propagate correctly

### EC-02: Empty user list
**Setup:** Search with no matches
**Expected:** Empty state in UsersTable

### EC-03: Search debounce timing
**Setup:** Type rapidly
**Expected:** Only one query fired after 300ms of inactivity (debounce)

## Known Gaps
- UsersTable component not inspected; exact columns and actions unknown
- Impersonation flow not covered (if implemented)
- `usePlatformAdminRole()` hook not inspected
