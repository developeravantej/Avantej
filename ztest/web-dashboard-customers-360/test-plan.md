# Test Plan: Customer 360 Page

**Route:** `/dashboard/customers/$id`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- A known customer ID in the tenant DB
- Customer has packages, payments, and appointments

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/customers/<valid_id>`
**Steps:**
1. Log in, navigate to a valid customer ID
2. Wait for all tabs to load
**Expected:**
- Back arrow link to `/dashboard/customers/view`
- Customer avatar (initials), name, status badge
- Package Instances visible
- Tabs: likely Overview, Packages, Payments, Appointments
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Expected:**
- Skeleton loaders shown in header and tab sections

### TC-03: Packages tab — populated
**Trigger:** Wait for packages data
**Steps:**
1. Navigate to customer with packages
**Expected:**
- PackageRow components rendered for each package
- Package shows: service name, credits total, status, trainer

### TC-04: Packages tab — empty state
**Trigger:** Customer with no packages
**Expected:**
- Empty state shown in packages section

### TC-05: Payments tab
**Trigger:** View payment history
**Steps:**
1. Navigate to customer, view payments
**Expected:**
- Invoices/payments listed with date, amount, mode
- `client.invoices.list({ organizationId, salesOrderId })` or similar called

### TC-06: Appointments tab
**Trigger:** View appointments
**Steps:**
1. Navigate to customer, view appointments
**Expected:**
- Appointment history shown
- Each appointment: service, trainer, date/time, status badge

### TC-07: Customer status badge
**Trigger:** Check status display
**Steps:**
1. Navigate to active customer
**Expected:**
- `memberStatusVariant("active")` → "default" badge variant (green/primary)

### TC-08: Customer status — inactive
**Trigger:** Navigate to inactive customer
**Expected:**
- Status badge shows "secondary" variant (muted)

### TC-09: Freeze membership — PauseCircle button
**Trigger:** Click PauseCircle (Pause Membership) button
**Steps:**
1. Navigate to customer 360
2. Click the PauseCircle button in the header area
**Expected:**
- FreezeMembershipDialog opens
- Package selector (only non-paused packages are eligible)
- Start date and End date inputs (default: today)
- Reason dropdown: Medical, Travel, Other
- "Waive freeze fee" checkbox
- Notes textarea (optional)
- "Pause membership" submit button

### TC-10: Freeze membership — valid submission
**Trigger:** Fill and submit freeze dialog
**Steps:**
1. Select an eligible package
2. Set startDate = today, endDate = tomorrow
3. Select reason "medical"
4. Click "Pause membership"
**Expected:**
- `client.memberships.freeze({ organizationId, packageInstanceId, memberId, startDate, endDate, reason, feeWaived, notes })` called
- Dialog closes on success
- Query invalidated (customerDirectory detail)

### TC-11: Freeze membership — end date before start date
**Trigger:** Set endDate before startDate
**Expected:**
- `canSubmit` = false; submit button disabled
- Error shown if submitted

### TC-12: Freeze membership — no eligible packages
**Trigger:** Customer has all packages paused
**Expected:**
- Package selector shows "No active packages" disabled option
- Submit button disabled

### TC-13: Lead Source section — view
**Trigger:** View customer with no lead source
**Expected:**
- "Lead Source" card visible
- "No attribution recorded." shown
- "Add" button visible (if canEdit=true)

### TC-14: Lead Source section — add/edit
**Trigger:** Click Add/Edit button
**Steps:**
1. Click "Add" or "Edit" on lead source card
**Expected:**
- Dialog opens with: Source dropdown, Referrer member ID input, Campaign tag input
- `client.customerProfiles.listLeadSources({ organizationId })` called
- On save: `client.customerProfiles.upsertForCustomer(...)` called
- Card updates with new attribution data

### TC-15: Household section
**Trigger:** View customer household
**Expected:**
- HouseholdSection card visible
- If no household: option to create new or attach to existing
- If has household: household name shown, detach option

### TC-16: KPI strip — 4 KPI cards
**Trigger:** Wait for customer data
**Expected:**
- 4 KPI cards: Total Spend, Active Packages, Appointments, Something else
- Each shows label and value

### TC-18: Not found — invalid customer ID
**Trigger:** Navigate to `/dashboard/customers/nonexistent-id`
**Steps:**
1. Navigate with random UUID that doesn't exist
**Expected:**
- `data` is null/undefined from query
- Error state or "Customer not found" displayed
- No crash

### TC-19: UUID validation
**Trigger:** Navigate with non-UUID format
**Steps:**
1. Navigate to `/dashboard/customers/not-a-uuid`
**Expected:**
- `UUID_RE` constant defined in page; used for validation
- Appropriate error shown or API returns 404

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.customerDirectory.getDetail({ organizationId, id })` or similar | TC-01, TC-18 |
| `client.packageInstances.listByCustomer(...)` | TC-03, TC-04 |
| `client.invoices.list({ organizationId, ... })` | TC-05 |
| `client.appointments.list({ organizationId, clientId: id })` | TC-06 |
| `client.memberships.freeze({ organizationId, packageInstanceId, memberId, ... })` | TC-10 |
| `client.customerProfiles.listLeadSources({ organizationId })` | TC-14 |
| `client.customerProfiles.upsertForCustomer({ organizationId, targetUserId, ... })` | TC-14 |

## Edge Cases

### EC-01: Customer with 100+ packages
**Setup:** High-volume customer
**Expected:** List renders all packages without crash; possible pagination

### EC-02: Appointment status variants
**Setup:** Appointments with "no-show", "cancelled" statuses
**Expected:** `appointmentStatusVariant()` maps correctly; appropriate badge variants shown

### EC-03: Invalid UUID format
**Setup:** Navigate to `/dashboard/customers/not-a-uuid`
**Expected:** API returns error; error state shown

## Known Gaps
- Exact tab structure of Customer 360 not confirmed (tabs in route file not explicit)
- PackageRow component not inspected in detail
- Suspend/unlock confirmation dialog behavior not confirmed
