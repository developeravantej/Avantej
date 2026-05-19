# Test Plan: Settings — Tax Rates

**Route:** `/dashboard/settings/tax-rates`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Some tax rates in tenant DB
- `tax_configuration` permission required for write operations

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/settings/tax-rates`
**Steps:**
1. Log in, navigate to route
2. Wait for load
**Expected:**
- Tag icon + "Tax Rates" heading (or similar)
- Plus button to add tax rate
- DataTable with tax rate rows
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Expected:**
- PageLoader shown

### TC-03: Tax rates table — populated
**Trigger:** Wait for data
**Expected:**
- Rows show: name, code, rate (displayed as percentage), category, default indicator (Star icon), effective dates, status
- Default tax rate row highlighted or marked with Star icon

### TC-04: Empty state
**Trigger:** No tax rates in DB
**Expected:**
- EmptyState component shown

### TC-05: Add tax rate — open dialog
**Trigger:** Click Plus button
**Steps:**
1. Click Plus/Add button
**Expected:**
- Create dialog opens
- Fields: name, code, rate (%), category (SST/GST/service_tax/etc.), isDefault checkbox, effectiveFrom, effectiveUntil, description

### TC-06: Add tax rate — valid submission
**Trigger:** Fill form and submit
**Steps:**
1. Open dialog
2. Fill all required fields (name: "SST 8%", code: "SST", rate: "8", category: "SST", effectiveFrom: today)
3. Submit
**Expected:**
- `client.taxRates.create(...)` called
- Dialog closes
- New tax rate in table
- Success toast

### TC-07: Add tax rate — validation errors
**Trigger:** Submit empty/invalid form
**Expected:**
- Validation errors on required fields
- Rate must be numeric

### TC-08: Edit tax rate — open dialog
**Trigger:** Click Edit icon on a row
**Steps:**
1. Click Edit (pencil icon) on a tax rate row
**Expected:**
- Edit dialog opens pre-filled with tax rate data

### TC-09: Edit tax rate — valid submission
**Trigger:** Modify and save
**Steps:**
1. Change name or rate
2. Submit
**Expected:**
- `client.taxRates.update(id, ...)` called
- Table updated
- Success toast

### TC-10: Set as default
**Trigger:** Click Star icon on non-default tax rate
**Steps:**
1. Find a non-default tax rate
2. Click Star/default button
**Expected:**
- `client.taxRates.setDefault(id)` called
- Previous default rate loses default status
- New rate marked as default with Star

### TC-11: Deactivate tax rate
**Trigger:** Toggle active status
**Steps:**
1. Click deactivate on an active tax rate
**Expected:**
- `client.taxRates.deactivate(id)` called
- Per MEMORY.md: silently clears isDefault flag too if rate was default
- Status updated in table

### TC-12: Rate displayed as percentage
**Trigger:** View rate values
**Expected:**
- `rateInBasisPoints` stored (e.g., 800 = 8.00%)
- Displayed as "8.00%" in table

### TC-13: StatusCallout for important states
**Trigger:** View page with default tax rate set
**Expected:**
- StatusCallout shows relevant info about current default rate

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.taxRates.list({ organizationId })` | TC-03, TC-04 |
| `client.taxRates.create(...)` | TC-06 |
| `client.taxRates.update(id, ...)` | TC-09 |
| `client.taxRates.setDefault(id)` | TC-10 |
| `client.taxRates.deactivate(id)` | TC-11 |

## Edge Cases

### EC-01: Setting default when one already exists
**Setup:** Two tax rates, one default
**Expected:** Server atomically clears old default and sets new; no two defaults at once

### EC-02: Deactivate default rate
**Setup:** Deactivate the current default tax rate
**Expected:** Per MEMORY.md, silently clears isDefault rather than throwing

### EC-03: Rate = 0 (tax exempt)
**Setup:** Create tax_exempt category with 0% rate
**Expected:** Accepted; displayed as "0.00%"

## Known Gaps
- Category enum values confirmed: SST, GST, service_tax, withholding_tax, tax_exempt, custom
- effectiveUntil date validation (cannot be before effectiveFrom) not confirmed
