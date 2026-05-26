# Test Plan — audit-prove-a session 2026-05-27-0143

Session: `zplan/2026-05-27-0143-audit-prove-a`
Branch: `audit-prove/remediation-services-tabs-20260525-1529`
DB verify mode: `api-read-back`

---

## Prerequisites

| Step | Description |
|------|-------------|
| SEED-01 | Login as tenant admin: `franchisee@gmail.com` / `password123` |
| SEED-02 | Confirm org `Test Fitness Franchise` is accessible |

---

## Golden Paths

### GP-01 — Login & session
1. Navigate to `http://localhost:3021`
2. Sign in with `franchisee@gmail.com` / `password123`
3. Assert: redirected to `/dashboard`
4. Assert: org name visible in sidebar

### GP-02 — Dashboard index loads
1. Navigate to `/dashboard`
2. Assert: page renders without JS error/crash
3. Assert: KPI cards visible (Revenue, Members, Appointments, etc.)

### GP-03 — Commissions view — Mine/All tabs
1. Navigate to `/dashboard/commissions/view`
2. Assert: tabs rendered (Mine, All, Review, Liability, Payouts)
3. Click "All" tab
4. Assert: table renders (or empty state) without console error

### GP-04 — Commissions Review tab
1. Navigate to `/dashboard/commissions/view?tab=review`
2. Assert: Review tab active
3. Assert: table renders (or empty state)

### GP-05 — Commissions Payouts tab
1. Navigate to `/dashboard/commissions/view?tab=payouts`
2. Assert: Payouts tab active
3. Assert: "Run Batch" button visible

### GP-06 — Payment history view
1. Navigate to `/dashboard/payment/view` (or `/dashboard/financial/payment`)
2. Assert: page renders without JS error/crash
3. Assert: table renders (or empty state)

### GP-07 — Sales list
1. Navigate to `/dashboard/sales/view`
2. Assert: page renders without JS error
3. Assert: status filter pills visible

### GP-08 — Customer quick-add
1. Navigate to customers page
2. Click "Quick Add" button
3. Assert: dialog opens with Name, Phone, Email fields

---

## Finding Journeys

### F-CP-001 — commission_payout:process never seeded → runBatch FORBIDDEN
*Kind: absence-assertion (missing — API always fails)*
1. Navigate to `/dashboard/commissions/view?tab=payouts`
2. Click "Run Batch" button (or "Process Pending")
3. **Assert FAIL**: API call to `payouts.runBatch` returns HTTP 403 / `FORBIDDEN` code
4. Assert: no success toast shown
5. (After fix) Assert: call succeeds or returns 200 with result

### F-CP-002 — commission_review:resolve never seeded → resolveReview FORBIDDEN
*Kind: absence-assertion (missing — API always fails)*
1. Navigate to `/dashboard/commissions/view?tab=review`
2. If table has rows: click Approve or Reject on a review item
3. **Assert FAIL**: API call to `commission-splits.review.resolve` returns 403 / `FORBIDDEN`
4. (After fix) Assert: resolveReview returns 200 and row disappears from table

### F-DU-001 — payment/view runtime crash: item.date.toISOString()
*Kind: absence-assertion (page crashes on load)*
1. Navigate to `/dashboard/payment/view` (or wherever payment history lives)
2. **Assert FAIL**: page should NOT throw JS TypeError on load
3. Assert: payment history table visible and date column shows formatted dates (not blank/crash)
4. (After fix) Assert: dates render correctly in all rows

### F-CP-003 — Payouts UI gates on :update, API needs :process
*Kind: partial — buttons appear but always FORBIDDEN*
1. Navigate to `/dashboard/commissions/view?tab=payouts`
2. Assert: "Run Batch" / "Process Pending" buttons are visible (permission check passes — user has :update)
3. Click "Run Batch"
4. **Assert FAIL**: response is 403 FORBIDDEN (not success)
5. (After fix) Assert: permission check aligned, button works

### F-CP-004 — Sidebar Payouts isActive always false
*Kind: partial — nav item never highlighted*
1. Navigate to `/dashboard/commissions/view?tab=payouts`
2. Inspect sidebar "Payouts" item
3. **Assert FAIL**: "Payouts" nav item does NOT have active/highlighted styling
4. (After fix) Assert: "Payouts" nav item is highlighted when on that URL

### F-DU-002 — Payment view: Created By shows raw UUID
*Kind: missing — display bug*
1. Navigate to payment history view
2. Assert table renders
3. Inspect "Created By" column value
4. **Assert FAIL**: value should NOT be a UUID string (e.g., `xxxxxxxx-xxxx-…`)
5. (After fix) Assert: value is a human-readable name

### F-DU-005 — Sidebar Packages uses wrong permission
*Kind: partial — nav item hidden for users with package_management:read*
1. Login as a user with `package_management:read` but NOT `service_management:read`
2. Assert: Packages nav item IS visible in sidebar
3. (Current state: may be hidden because sidebar checks wrong permission)
4. (After fix) Assert: sidebar uses `package_management:read` → item shown

### F-CU-002 — addEmailAndDispatchMagicLink: no RBAC scope check
*Kind: missing — security — cross-tenant access*
1. Login as staff user scoped to Branch A
2. Obtain a customer profile ID from Branch B (via direct API call with admin token)
3. Call `customerProfiles.addEmailAndDispatchMagicLink` with Branch-B profile ID
4. **Assert FAIL**: should return 403 FORBIDDEN (but currently succeeds)
5. (After fix) Assert: returns 403 if profile is out of scope

### F-CU-003 — resendMagicLink: no RBAC scope check
*Kind: missing — security*
1. Same cross-scope setup as CU-002
2. Call `customerProfiles.resendMagicLink` with Branch-B profile ID
3. **Assert FAIL**: should return 403 but currently succeeds
4. (After fix) Assert: 403 for out-of-scope profiles

### F-CU-004 — sendClaimLink: no RBAC scope check
*Kind: missing — security*
1. Same cross-scope setup
2. Call `customerProfiles.sendClaimLink` with Branch-B unclaimed profile ID
3. **Assert FAIL**: should return 403 but currently succeeds
4. (After fix) Assert: 403 for out-of-scope profiles

### F-CU-005 — createUnclaimed non-atomic (orphan risk)
*Kind: missing — backend reliability*
1. Create an unclaimed customer via Quick Add with valid data
2. Assert: customerProfile row exists — read-back via `customerProfiles.list`
3. Assert: no orphaned CP user if tenant write fails (inject error via invalid data)
4. Persistence check (api-read-back): `customerProfiles.list` returns new unclaimed profile

### F-CU-006 — createUnclaimed no phone dedup
*Kind: missing — data integrity*
1. Quick Add customer with phone `+60123456789`
2. Quick Add same phone again
3. **Assert FAIL**: second call should fail/deduplicate, but currently creates a duplicate
4. Persistence check: `customerProfiles.list` should have only 1 row with that phone
5. (After fix) Assert: second call returns error or merges record

### F-PO-005 — Online payment never sends link
*Kind: missing — feature absent*
1. In POS, create a sale with "Online" payment method
2. Assert: order status = `pending`
3. **Assert FAIL**: no payment link email sent / link returned in response
4. (After fix) Assert: Stripe link created and dispatched

### F-PO-006 — Sales filter 'Refunded' maps to 'cancelled'
*Kind: missing — label bug*
1. Navigate to sales list
2. Assert: filter pill labeled "Refunded" is visible
3. Click "Refunded" filter
4. **Assert FAIL**: URL / API call should filter `status=refunded` but actually filters `status=cancelled`
5. Inspect network or URL param
6. (After fix) Assert: Refunded filter queries `status=refunded`

### F-PO-007 — Sales $id line items only in print modal
*Kind: missing — UX*
1. Navigate to a sale detail page (`/dashboard/sales/<id>`)
2. Assert: page renders
3. **Assert FAIL**: line items table is NOT visible on main page (only accessible via Print Receipt)
4. (After fix) Assert: line items visible on main Order Summary card

### F-PO-008 — Cancel Sale never shown for POS sales
*Kind: missing — status bug*
1. Create a POS sale (walk-through POS checkout)
2. Navigate to resulting sale detail page
3. **Assert FAIL**: Cancel Sale button NOT visible (order.status='completed', button checks for 'confirmed')
4. (After fix) Assert: Cancel Sale button visible for completed POS sales

### F-SI-001 — Notification dispatch unbounded SELECT
*Kind: missing — runtime risk (hard to prove without load)*
1. Trigger notification dispatch cron (or call service directly in test)
2. Assert: service completes without timeout/OOM
3. (After fix) Assert: query includes LIMIT and paginates correctly

---

## Persistence Checks (api-read-back mode)

| Check ID | Journey | Verify via |
|----------|---------|-----------|
| PC-CU-005 | createUnclaimed creates profile | `customerProfiles.list` returns new row |
| PC-CU-006 | Phone dedup prevents duplicates | `customerProfiles.list` count = 1 after two Quick Adds |
| PC-CP-001 | After fix: runBatch creates payout rows | `payouts.list` returns new rows |
| PC-CP-002 | After fix: resolveReview closes item | `commission-splits.review.list` row gone |

---

## Execution Order

1. SEED-01 / SEED-02 (login)
2. GP-01 through GP-08 (golden paths, sequential)
3. F-DU-001 (crash test — run early to catch JS errors)
4. F-CP-001, F-CP-002 (FORBIDDEN tests — no side effects)
5. F-CP-003, F-CP-004 (permission alignment)
6. F-DU-002, F-DU-005 (display fixes)
7. F-PO-006, F-PO-007, F-PO-008 (sales fixes)
8. F-CU-005, F-CU-006 + persistence checks (write-path, last)
9. F-CU-002, F-CU-003, F-CU-004 (RBAC security — require two member accounts)
10. F-SI-001 (service-level — last)
