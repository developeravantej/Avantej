# Test Coverage Gap Map — 2026-06-01

Source: 6 parallel read-only coverage agents swept ~290 procedures across client
(`packages/api/src/routers/`) + server (`apps/server/src/routers/`) routers,
cross-referenced against `e2e/*.spec.ts` and `*.router.test.ts` / `*.test.ts`.

**Confidence caveat:** the inventory agent inferred "UNIT-ONLY" for many procedures
without confirming a test file exists — treat those as *possibly* untested. Every
item in the P0 list below was cross-checked as having **no e2e and no obvious unit test**.

**Scope note:** Partner-Stripe coach-payout-via-Stripe was removed (commit 8b803571);
`stripe_connect` payout gaps are intentionally excluded — that feature is gone. The
kept charge flow (Customer → gym's Stripe account, `orgCountryStripeAccounts`) is
e2e-covered by `pos-stripe-ui-checkout.journey.spec.ts`.

---

## 🔴 P0 — money / stock / irreversible, zero coverage

### Inventory & stock ledger  ← highest-value, lowest-effort cluster
The 0079 `stock_movements` audit trail and 0081 `credit_point_ledger` are **new and
completely unguarded**. One e2e fixture (receive goods → transfer → adjust → assert
`stock_movements` rows balance) covers ~8 P0 procedures at once.
- `products.adjustStock` — core stock-mutation primitive
- `transferOrders.complete` / `markReceived` / `markInTransit` / `cancel` — branch-to-branch stock movement
- `goodsReceipts.create` / `cancel` / `matchInvoice` (3-way match) / `markInvoicePaid` — supplier receiving + financial close
- `purchaseOrders.approve` / `cancel`

### Promotions & tax math
- `promotions.validate` / `apply` — discount math + credit-point (0081) deduction, untested
- `taxRates.create` / `setDefault` — basis-point tax math feeding every sale

### Commissions (domain rule: commission must reach the right trainer)
- `commissionSplits.void` / `voidById` — money-reversal path never exercised
- `commissionSplits.markPaidBatch` — bulk settlement by member+date window
- `commissionSplits.listPendingReview` — Review tab tested *assuming* rows exist; nothing creates them
- `payouts.previewBatch` vs `runBatch` — preview/actual amount consistency unverified

### Installments (domain rule: installment amount shows, not full price)
- `installments.adjustCredits` / `processRefund` / `waive` — direct credit/money mutation, no audit-trail test

### Expenses (separation-of-duties)
- `expenses.approve` / `markPaid` — SoD enforcement claimed, never tested

### Platform / tenant lifecycle (server)
- `provisionTenant` — multi-step (Neon + migrations + email), partial-failure untested
- `requestTenantDeletion` / `restoreTenantDeletion` — irreversible, grace-window logic untested
- `admin.impersonateUser` — session swap + role elevation, restore-failure path untested
- `refundInvoice` (platform-admin-billing.ts + platform-admin-tenants-billing.ts) — money reversal
- `stripe-connect.getAccountStatus` — Stripe API call + caching race with webhook

---

## 🟠 P1 — RBAC / cross-tenant (highest risk vs the "tenant A never sees B" rule)

RBAC agent: **64 of 86 procedures have no unit test**, relying on implicit
`tenantProcedure` guards. Procedures where a missing guard would leak across tenants/branches:
- `roles.create/update/delete` + `rolePermissions.add/remove` — privilege-escalation surface, no isolation test
- `hierarchy.createNode / moveNode / deleteNode` — scope re-inheritance + member orphaning
- `members.updateRole / updateScope` — peer-escalation / cross-branch reassignment
- `serviceMembers.assign` — cross-branch trainer→service binding
- `households.create / removeMember` — primary-contact cascade, cross-branch binding

Other P1 (non-isolation):
- `salesOrders.update` — no state-transition guard test (completed→draft rollback)
- `invoices.create/update` — billing mutation, org-boundary untested
- `packageInstances.bulkAssign` — partial-failure atomicity
- `classSlots.update` — capacity guard (cannot reduce below spotsBooked)
- `appointments.cancelSeries / cancelFuture` — credit-reinstatement cascade
- `memberships.freeze/resume/cancel` — hold state transitions
- `commissionTracks.setTrackRates / setCoachSlots` — rate/slot math (slots must sum to 10000bp)
- `trainerTiers.assignToMember` — tier feeds rate lookup
- `commissionCycle.*` — cycle-window policy
- `ghl.connectBranch / retryFailedSyncs` — external API + encryption
- `invitations.accept / acceptWithSignup` (server) — full flow + GHL sync untested
- Platform feature-flags `setOverride/clearOverride`, renewals/health/webhooks/migrations procs (helper-tested only)

---

## 🟡 P2 — audit / UX, lower blast radius
- Status-history + CSV-export queries: `salesOrders.statusHistory`, `cancelledSales.exportCsv`, `auditLogs.exportCsv`, `invoices.paymentStatusHistory`
- `pos.getReceiptData` — multi-join, branch-scope unverified
- Notifications, announcements, google-calendar CRUD, trainer-availability (13 procs), rooms, preferred-times
- Platform read/aggregation procs: dashboard, revenue, tenants-search, tenants-notes, audit-log list

---

## Recommended sequencing
1. **Stock-movement ledger** (P0, ~8 procedures, one fixture) — money-adjacent, new ledgers unguarded.
2. **RBAC isolation** (P1) — single missing guard violates the hard tenant-isolation rule.
3. **Promotions + tax math** (P0) — discount/tax correctness + 0081 credit-point ledger.
4. Commissions void/batch + installments credit-mutation (P0).
5. Platform lifecycle (provision/delete/impersonate) — server integration tests.

## Per-domain raw reports
Full procedure-by-procedure tables are in the agent outputs (this session transcript).
Counts: POS/sales ~36 procs, commissions/payouts 47 (20 tested / 27 untested),
packages/appts ~90, members/RBAC 86 (22 covered / 64 no-unit-test),
server 30 routers (18 with no test file), inventory/misc 117 (60 untested, 23 P0).
