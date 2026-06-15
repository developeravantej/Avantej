# Test Plan: Settings — Installment Plans

**Route:** `/dashboard/settings/installment-plans`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Some installment plan records in tenant DB

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/settings/installment-plans`
**Steps:**
1. Log in, navigate to route
2. Wait for load
**Expected:**
- CreditCard icon + "Installment Plans" heading + "Define payment plans customers can choose at checkout"
- "New Plan" button (Plus icon)
- Active/All filter toggle (default: Active)
- Plan count display ("X plans")
- KPI strip: Active plans count, Avg installments, Shortest plan, Longest plan
- DataTable with installment plan rows
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Expected:**
- PageLoader shown

### TC-03: Installment plans table — populated
**Trigger:** Wait for data
**Expected:**
- Rows: code, name, numInstallments, defaultIntervalDays, pricePremiumBps (as %), isDefault (Star), isActive (badge), sortOrder

### TC-04: Empty state
**Trigger:** No installment plans
**Expected:**
- EmptyState component shown

### TC-05: Add installment plan — open dialog
**Trigger:** Click Plus
**Expected:**
- Create dialog with fields: code, name, numInstallments, defaultIntervalDays, pricePremiumPct, description, isDefault

### TC-06: Add installment plan — valid submission
**Trigger:** Fill all fields and submit
**Steps:**
1. Enter: code "M3", name "3-Month Plan", numInstallments: 3, defaultIntervalDays: 30, pricePremiumPct: 2.5
2. Submit
**Expected:**
- `client.installmentPlans.create(...)` called
- Dialog closes, new row in table
- Success toast

### TC-07: Add plan — validation errors
**Trigger:** Submit with empty/invalid fields
**Expected:**
- Required fields show errors
- numInstallments must be positive integer
- defaultIntervalDays must be positive integer

### TC-08: Edit installment plan
**Trigger:** Click Edit on a row
**Expected:**
- Edit dialog pre-filled
- `client.installmentPlans.update(id, ...)` on save

### TC-09: Set as default
**Trigger:** Click Star on non-default plan
**Expected:**
- `client.installmentPlans.setDefault(id)` called
- Star filled on clicked plan, unfilled on previous default

### TC-10: Deactivate installment plan — with warning
**Trigger:** Click "Deactivate" on an active plan
**Steps:**
1. Click Deactivate on a plan that is enabled on active services
**Expected:**
- `client.services.list({ organizationId, isActive: true })` called to check affected services
- If affectedCount > 0: warning text "This plan is currently enabled on N active service(s)..."
- Confirm deactivate dialog opens regardless
- `client.installmentPlans.deactivate(id)` called on confirm
- Row status updates to Inactive; hidden if "Active" filter is on

### TC-10b: Show inactive toggle
**Trigger:** Click "All" in Active/All filter
**Expected:**
- Inactive plans now visible (Badge variant "outline" showing "Inactive")
- Active filter shows only active plans

### TC-11: Code immutability on edit
**Trigger:** Open edit dialog for existing plan
**Expected:**
- Code field is disabled (cannot be changed)
- Tooltip/hint: "Code cannot be changed after creation."

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.installmentPlans.list({ organizationId })` | TC-03 |
| `client.installmentPlans.create(...)` | TC-06 |
| `client.installmentPlans.update(id, ...)` | TC-08 |
| `client.installmentPlans.setDefault(id)` | TC-09 |
| `client.installmentPlans.deactivate(id)` | TC-10 |

## Edge Cases

### EC-01: pricePremiumPct = 0 (no premium)
**Setup:** Free installment plan with 0% premium
**Expected:** Accepted; displayed as "0.00%"

### EC-02: numInstallments = 1
**Setup:** Single installment (essentially no installments)
**Expected:** Accepted; might represent immediate full payment

### EC-03: isDefault checkbox only on create
**Setup:** Edit existing plan
**Expected:** isDefault checkbox not shown in edit dialog (only create dialog has it)

### EC-04: Deactivate plan with no affected services
**Setup:** Plan not used by any active service
**Expected:** No warning text shown; deactivate dialog shown with standard confirmation only

## Known Gaps
- pricePremiumBps stored as basis points; `pricePremiumPct` in form is string parsed to float × 100
- sortOrder column exists but no drag/sort UI confirmed in route file
- isDefault on edit: only settable via Star button in table, not in edit dialog
