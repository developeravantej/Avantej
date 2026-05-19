# Test Plan: Commissions View

**Route:** `/dashboard/commissions/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Some commission records in tenant DB
- Admin user: has `commission_management:read` and `commission_payout:read`
- Staff user: only sees "My Commissions" tab

## Test Cases

### TC-01: Page loads — staff user (Mine tab only)
**Trigger:** Navigate as staff user
**Steps:**
1. Log in as staff without commission_management:read
2. Navigate to `/dashboard/commissions/view`
**Expected:**
- TrendingUp icon + "Commissions" heading + description
- Only "My Commissions" tab visible
- MyCommissionsPage renders
- No "All Commissions" or "Liability" tabs

### TC-02: Page loads — admin user (all tabs)
**Trigger:** Navigate as admin
**Steps:**
1. Log in as admin with both permissions
2. Navigate to route
**Expected:**
- "My Commissions", "All Commissions", "Liability" tabs all visible
- "My Commissions" tab active by default (tab=mine)

### TC-03: My Commissions tab content
**Trigger:** View mine tab
**Steps:**
1. Navigate to route (default tab)
**Expected:**
- MyCommissionsPage renders
- Personal commission records shown

### TC-04: All Commissions tab — admin only
**Trigger:** Click "All Commissions" tab as admin
**Steps:**
1. Navigate as admin
2. Click "All Commissions" tab
**Expected:**
- URL: `?tab=all`
- AllCommissionsPage renders
- All staff commissions visible

### TC-05: Liability tab — admin with payout permission
**Trigger:** Click "Liability" tab
**Steps:**
1. Navigate as admin with commission_payout:read
2. Click "Liability" tab
**Expected:**
- URL: `?tab=liability`
- LiabilityTab renders

### TC-06: Tab not shown without permission
**Trigger:** Missing commission_management:read
**Expected:**
- "All Commissions" tab not in TABS array
- Cannot navigate to all tab

### TC-07: Missing commission_payout:read
**Expected:**
- "Liability" tab not visible

### TC-08: Direct URL to unauthorized tab
**Trigger:** Navigate to `?tab=all` as staff
**Expected:**
- AllCommissionsPage renders but tab button is not visible in the TABS array
- Staff can still navigate to it via direct URL; component-level guard applies if any

### TC-09-confirmation: Tab rendering matches hasPermission
**Trigger:** Check TABS array construction
**Expected:**
- TABS is built dynamically: always includes "mine"
- "all" included only if `hasPermission("commission_management:read")`
- "liability" included only if `hasPermission("commission_payout:read")`
- Tab buttons rendered only for tabs in TABS array

### TC-09: My Commissions — populated
**Trigger:** With commission data
**Expected:**
- Commission rows: service, amount, status, date
- Approve/pending status shown

### TC-10: All Commissions — approve commission
**Trigger:** Admin clicks approve on pending commission
**Steps:**
1. Navigate to all tab as admin
2. Click approve on a pending commission
**Expected:**
- `client.commissions.approve(id)` called
- Commission status updates to "approved"

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.commissions.list({ organizationId, memberId? })` | TC-03, TC-09 |
| `client.commissions.listAll({ organizationId })` | TC-04 |
| `client.commissions.approve(id)` | TC-10 |
| `client.commissions.getLiability({ organizationId })` | TC-05 |
| `useUserContext().hasPermission()` | TC-01, TC-06, TC-07 |

## Edge Cases

### EC-01: Unknown tab param
**Setup:** `?tab=unknown`
**Expected:** `validateSearch` defaults to "mine"; MyCommissionsPage renders

### EC-02: Empty commissions
**Setup:** No commissions yet
**Expected:** Empty state shown in each tab

## Known Gaps
- MyCommissionsPage, AllCommissionsPage, LiabilityTab components not inspected
- Exact commission approval flow and permission checks in those components unknown
