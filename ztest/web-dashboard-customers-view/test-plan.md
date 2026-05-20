# Test Plan: Customers View (Registered Customers)

**Route:** `/dashboard/customers/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Route delegates to `RegisteredCustomersPage` component
- Some registered customer profiles in tenant DB

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/customers/view`
**Steps:**
1. Log in, navigate to route
2. Wait for load
**Expected:**
- RegisteredCustomersPage renders
- Customer list/table visible
- Search or filter controls visible
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Expected:**
- Loading indicator shown

### TC-03: Customers table — populated
**Trigger:** Wait for customer data
**Expected:**
- Table rows show customer info (name, email, membership status, etc.)

### TC-04: Empty state
**Trigger:** No customers registered
**Expected:**
- EmptyState shown

### TC-05: initialCustomerId param — opens customer
**Trigger:** Navigate with customerId search param
**Steps:**
1. Navigate to `/dashboard/customers/view?customerId=<id>`
**Expected:**
- `initialCustomerId` passed to RegisteredCustomersPage
- Customer panel/detail for that ID opens automatically

### TC-06: Navigate to Customer 360
**Trigger:** Click on a customer row
**Steps:**
1. Click on any customer row
**Expected:**
- Navigate to `/dashboard/customers/<id>`
- Customer 360 page opens

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| Customer list API (in RegisteredCustomersPage) | TC-03 |

## Edge Cases

### EC-01: Unknown customerId in URL
**Setup:** Navigate with `?customerId=nonexistent`
**Expected:** No crash; component handles missing customer gracefully

## Known Gaps
- RegisteredCustomersPage component not read in detail
- Exact search, filter, and column details unknown
