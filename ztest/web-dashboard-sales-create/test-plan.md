# Test Plan: Sales Create (POS)

**Route:** `/dashboard/sales/create`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Route delegates to `PosWorkflow` component
- Services and customers exist in tenant DB

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/sales/create`
**Steps:**
1. Log in, navigate to route
2. Wait for load
**Expected:**
- PosWorkflow component renders
- Sales creation flow visible (customer selector, service selector, payment)
- No console errors

### TC-02: Page loads with prefilled customer
**Trigger:** Navigate with customer param
**Steps:**
1. Navigate to `/dashboard/sales/create?customer=<customer_id>`
**Expected:**
- `prefillCustomerId` passed to PosWorkflow
- Customer pre-selected in form

### TC-03: Customer selection
**Trigger:** Select a customer in POS
**Steps:**
1. Navigate to route (no customer param)
2. Search/select a customer
**Expected:**
- Customer selected
- Next step unlocked

### TC-04: Service/package selection
**Trigger:** Add services/packages to cart
**Steps:**
1. Select customer
2. Add one or more services
**Expected:**
- Services added to order
- Running total calculated

### TC-05: Payment
**Trigger:** Complete payment
**Steps:**
1. Select customer, add services
2. Select payment method
3. Submit
**Expected:**
- `client.salesOrders.create` or `client.pos.createSale` called
- Order created
- Receipt/confirmation shown
- Navigate to order detail or back to sales list

### TC-06: Cancel/back navigation
**Trigger:** Cancel in POS workflow
**Steps:**
1. Navigate to POS
2. Click cancel/back
**Expected:**
- Navigate back to `/dashboard/sales/view`
- No partial order created

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| POS workflow API calls (in PosWorkflow component) | TC-03, TC-04, TC-05 |

## Edge Cases

### EC-01: Invalid customer ID in param
**Setup:** Navigate with `?customer=nonexistent`
**Expected:** PosWorkflow handles gracefully; customer not pre-selected or error shown

## Known Gaps
- PosWorkflow component not inspected in detail
- Exact POS flow steps, payment methods, and receipt behavior unknown
