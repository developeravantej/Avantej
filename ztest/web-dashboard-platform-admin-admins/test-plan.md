# Test Plan: Platform Admin — Admins Management

**Route:** `/dashboard/platform-admin/admins`
**Auth required:** yes (platform admin with super_admin role)
**Last round:** 1

## Preconditions
- Log in as developer.avantej@gmail.com / password1234 (super_admin)
- `client.admin.me({})` returns `{ isPlatformAdmin: true, role: "super_admin" }`

## Test Cases

### TC-01: Page loads — super_admin user
**Trigger:** Navigate as super_admin
**Steps:**
1. Log in as developer.avantej@gmail.com / password1234
2. Navigate to `/dashboard/platform-admin/admins`
3. Wait for load
**Expected:**
- Shield icon + "Platform Admin — Admins" heading
- Admin list table
- "Add Admin" / invite button
- Search input
- No console errors

### TC-02: Permission guard — non-platform-admin redirect
**Trigger:** Navigate as regular user
**Steps:**
1. Log in as franchisee@gmail.com
2. Navigate to route
**Expected:**
- `client.admin.me({})` check runs in `beforeLoad`
- `isPlatformAdmin === false` → redirect to `/dashboard`
- No admin page visible

### TC-03: Permission guard — platform admin but not super_admin
**Trigger:** Navigate as regular platform admin
**Steps:**
1. Log in as admin without super_admin role
2. Navigate to route
**Expected:**
- `role !== "super_admin"` → redirect to `/dashboard`

### TC-04: Admins list — populated
**Trigger:** Wait for data
**Expected:**
- Table shows platform admins
- Each row: user ID, email, name, role (super_admin/admin), status

### TC-05: Search admins
**Trigger:** Enter search query
**Steps:**
1. Type in search input
**Expected:**
- Debounced search (useDebounce)
- List filters to matching admins

### TC-06: Add admin — open dialog
**Trigger:** Click "Add Admin" or plus button
**Expected:**
- Dialog opens with email input and role selector

### TC-07: Add admin — valid submission
**Trigger:** Fill email and role, submit
**Steps:**
1. Enter valid email, select role
2. Submit
**Expected:**
- `client.admin.addAdmin(...)` called
- New admin appears in list
- Success toast

### TC-08: Add admin — validation errors
**Trigger:** Submit empty
**Expected:**
- Email validation error

### TC-09: Remove admin
**Trigger:** Click remove/delete on an admin row
**Steps:**
1. Find an admin (not self)
2. Click remove
3. Confirm in dialog
**Expected:**
- `client.admin.removeAdmin(id)` called
- Admin removed from list
- Toast confirmation

### TC-10: Role selector in add dialog
**Trigger:** Inspect role options
**Expected:**
- Select shows: "super_admin", "admin" (or similar role options)

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.admin.me({})` | TC-01, TC-02, TC-03 |
| `client.admin.listAdmins({ search?, page? })` | TC-04, TC-05 |
| `client.admin.addAdmin({ email, role })` | TC-07 |
| `client.admin.removeAdmin(id)` | TC-09 |
| `authClient.useSession()` (Better-Auth) | TC-01 |

## Edge Cases

### EC-01: Re-throw TANSTACK_ROUTER_REDIRECT
**Setup:** Code has special handling for redirect errors in beforeLoad catch block
**Expected:** Redirects propagate correctly; not swallowed as generic errors

### EC-02: Remove self as admin
**Setup:** Try to remove own admin account
**Expected:** Prevented by server or client-side guard

### EC-03: Empty search result
**Setup:** Search for non-existent email
**Expected:** Empty state or "No admins found" message

## Known Gaps
- Dialog component for adding admins not inspected (uses Dialog or Sheet component)
- Exact role options in Select not confirmed
- `useDebounce` used for search; timing delay in tests
