# Test Coverage Audit — Customer Flow (2026-05-27)

Audit of the planned customer-flow test suite (POS → appointment → commission → payout → refund + customer entry/consumption) against existing E2E specs (`e2e/*.spec.ts`), server integration tests (`apps/server/src/tests/integration/*.ts` + `apps/server/src/routers/*.integration.test.ts`), and frontend component tests (`apps/web/src/__tests__/**`).

Sources cross-referenced (full read):
- `e2e/commission-rule-{cancel,complete}-appointment.journey.spec.ts`
- `e2e/commission-rule-pos-{product-immediate-split,service-no-split}.journey.spec.ts`
- `e2e/pos-checkout-{installment-schedule,non-client-member-error,package-salesorderid}.journey.spec.ts`
- `e2e/payouts-{confirm-creates-row,kpi-mounts}.journey.spec.ts`
- `e2e/package-lifecycle-{cancel,extend,freeze-unfreeze}.journey.spec.ts`
- `e2e/sales-cancellation-{kpi,list}.journey.spec.ts`
- `e2e/trainer-assigned-packages-{drawer,tab}.journey.spec.ts`
- `e2e/fixes-verification.spec.ts`, `e2e/smoke.spec.ts`, `e2e/gap-prove.spec.ts`, `e2e/batch1.dashboard.spec.ts`
- `apps/server/src/tests/integration/commission-rule.integration.test.ts` (7 tests)
- `apps/server/src/tests/integration/appointment-commission.test.ts` (3 tests)
- `apps/server/src/tests/integration/pos-commission.test.ts` (4 tests)
- `apps/server/src/tests/integration/commission-calculator.test.ts` (5 tests)
- `apps/server/src/tests/integration/commission-versioning.test.ts`
- `apps/server/src/tests/integration/refund-items.test.ts` (5 tests)
- `apps/server/src/tests/integration/installment-refund.integration.test.ts`
- `apps/server/src/tests/integration/installments.integration.test.ts`
- `apps/server/src/tests/integration/installment-evaluator.integration.test.ts`
- `apps/server/src/tests/integration/installment-plans.integration.test.ts`
- `apps/server/src/tests/integration/installment-reschedule.integration.test.ts`
- `apps/server/src/tests/integration/installment-overview.integration.test.ts`
- `apps/server/src/tests/integration/appointment-overlap.test.ts`
- `apps/server/src/tests/integration/status-history.test.ts`
- `apps/server/src/tests/integration/promotions.integration.test.ts`
- `apps/server/src/tests/integration/sales-tax.test.ts`
- `apps/server/src/tests/integration/pricing.test.ts`
- `apps/web/src/__tests__/components/{commissions/bulk-approve-dialog,add-appointment-modal,appointment-{calendar,list},attendance/drop-in-form,category-commission-form}.test.tsx`
- Seed scripts: `apps/server/scripts/seed-{commission-config,business-data,customers,trainers,test-appointment,sales-invoice}.ts`, `seed-and-test-chain.ts`, `reseed-appointments.ts`, `e2e/helpers/seed-data.ts`

## Summary

- **Total planned specs (incl. lifecycle / customer entry / consumption items): 53**
- **Already covered (E2E or integration, with reasonable assertions): 24**
- **Partially covered (covered at a different layer or skip-prone): 13**
- **Net-new gaps: 16**

Confidence is highest at the **service / calculator layer**: commission lifecycle, dedup, attendee-based conditional gating, void-on-cancel-vs-protect-on-delivered, and refund credit accounting are all covered with proper FK cleanup in `commission-rule.integration.test.ts`, `pos-commission.test.ts`, `appointment-commission.test.ts`, `refund-items.test.ts`. Coverage is **weakest at the POS UI happy-path** (member cash sale, promo, walk-in, multi-tender), the **commission management UI** (My tab vs All tab, bulk-approve invariants, void dialog, liability tab), and **appointment calendar/RBAC UI** (trainer self-view narrowing, status-timeline visualization).

## Per-spec status table

### POS layer (9)

| #  | Planned spec                  | Existing coverage                                                                                                             | Status      | Notes                                                                                                                  |
| -- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1  | member-cash-sale              | `e2e/commission-rule-pos-service-no-split` exercises `recordPosSale` with `paymentMethod:"cash"` but only via API; no UI flow | Partial     | API call covered; UI golden-path (search member → add to cart → cash → success toast → salesOrder appears in list) is NOT asserted end-to-end. `gap-prove.spec.ts:GP-03` only smoke-checks the page mounts. |
| 2  | promo-discount                | `gap-prove.spec.ts:F-SP-03` (deactivated promo re-validation); `promotions.integration.test.ts` (service-layer)               | Partial     | Negative path covered (deactivated promo blocked). Happy-path "apply valid promo → discount appears in cart → SOI has promotion linkage" is missing end-to-end.    |
| 3  | walk-in-custom-line           | none                                                                                                                          | **Gap**     | `walk_in_customers` and `customerType="walk_in"` exist but no spec exercises the walk-in customer flow at the POS UI. |
| 4  | cash-tender-with-change       | none                                                                                                                          | **Gap**     | No coverage of tender amount > total → change due display + payment record. |
| 5  | installment-plan              | `e2e/pos-checkout-installment-schedule.journey.spec.ts` (asserts row count == plan.numInstallments); `installments.integration.test.ts`, `installment-plans.integration.test.ts` | Covered     | Strong coverage at both layers. |
| 6  | trainer-assignment            | `pos-commission.test.ts:TC-POS-001` (POS with `staffAssignments`); `commission-rule.integration.test.ts:TC-CR-I004`           | Partial     | POS-time `itemTrainerAssignments` is exercised via calculator. UI flow "assign trainer at POS for a service line" is NOT asserted (no spec navigates the trainer-pick step). |
| 7  | online-payment-coercion       | `gap-prove.spec.ts:F-SP-01` (POS rejects `stripe` paymentMethod when no Stripe account)                                       | Partial     | Negative path covered. Positive coercion ("online" → "stripe" in router) is not directly asserted. |
| 8  | prefill-customer              | none                                                                                                                          | **Gap**     | No spec covers `/dashboard/sales/create?customerId=X` (Quick Add → POS flow from commit 693744db). |
| 9  | embedded-mode                 | none                                                                                                                          | **Gap**     | No spec covers POS embedded in a customer/appointment drawer (if such embed exists). Need to confirm feature scope; flagging as gap. |

### POS edge cases (7)

| #  | Planned spec                  | Existing coverage                                                                                                             | Status      | Notes                                                                                                                  |
| -- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| 10 | promo-revalidates-on-cart-change | `gap-prove.spec.ts:F-SP-03`                                                                                                | Partial     | Re-validation at recordSale (deactivated promo) covered. Re-validation when cart total changes (promo min-amount falls below threshold mid-checkout) is not. |
| 11 | clear-cart-dialog             | none                                                                                                                          | **Gap**     | No UI spec asserts the "Clear cart?" confirm dialog. |
| 12 | cash-tender-auto-sync         | none                                                                                                                          | **Gap**     | No spec asserts the tender input auto-fills cart total. |
| 13 | branch-scope-required         | `gap-prove.spec.ts:PC-PS-02` (no null-branchId override row); `e2e/branch-onboarding.spec.ts`                                 | Partial     | Generic branch-scope guard covered for other write paths; specific "POS sale without branchId returns 400" is not directly asserted. |
| 14 | non-client-member error       | `e2e/pos-checkout-non-client-member-error.journey.spec.ts`                                                                    | Covered (currently skips due to `searchPosCustomers` filtering) | Spec is documented; the test skips because the admin doesn't appear in search. Needs seed of a non-client member that IS visible. |
| 15 | permission-guard              | `apps/server/src/tests/integration/hierarchy-scope.integration.test.ts`, `members-deactivate.integration.test.ts`             | Partial     | Generic guard coverage exists; "user without `pos:create` permission gets 403 at recordSale" is not directly tested.   |
| 16 | suspended-tenant              | none in e2e/integration                                                                                                       | **Gap**     | `orpc-tenant.middleware` is documented to block writes for suspended tenants but no spec asserts this for POS specifically. |

### Cross-domain (3)

| #  | Planned spec                  | Existing coverage                                                                                                             | Status      | Notes                                                                                                                  |
| -- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| 17 | pos-to-commission             | `commission-rule.integration.test.ts:TC-CR-I004`, `pos-commission.test.ts:TC-POS-001`, `e2e/commission-rule-pos-product-immediate-split.journey.spec.ts` | Covered     | Sale → split exists path strong at all layers. |
| 18 | pos-to-package-to-appointment | `e2e/pos-checkout-package-salesorderid.journey.spec.ts` (asserts `package_instances.salesOrderId`); `e2e/package-lifecycle-*` | Partial     | Package created from POS is asserted. Appointment booked from the package then consuming a credit is NOT asserted end-to-end (no `creditsUsed` increment check after attendance). |
| 19 | commission-void-reverses      | `commission-rule.integration.test.ts:TC-CR-I005,I006`                                                                         | Covered     | Both "void preserved post-delivery" and "void cancels pre-delivery" cases. |

### Appointments (10)

| #  | Planned spec                  | Existing coverage                                                                                                             | Status      | Notes                                                                                                                  |
| -- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| 20 | calendar-view                 | `e2e/fixes-verification.spec.ts:"loads with trainer sidebar"`; `gap-prove.spec.ts:GP-04`; `apps/web/src/__tests__/components/appointment-calendar.test.tsx` | Partial     | Page-mount and trainer-sidebar covered. Day/week/month navigation + event positioning not asserted in real run. |
| 21 | trainer-self-view (RBAC narrow) | none e2e; `hierarchy-scope.integration.test.ts` covers generic node access                                                   | **Gap**     | No spec asserts that logging in as a `trainer`-role member shows only their own appointments (RBAC narrowing in the calendar UI). |
| 22 | create                        | `e2e/fixes-verification.spec.ts:"add appointment modal opens"`; `appointment-commission.test.ts:createAppointment` helper     | Partial     | Modal-open covered; full create flow (fill form → submit → row appears) not asserted in real run. |
| 23 | attendance                    | `apps/web/src/__tests__/components/attendance/drop-in-form.test.tsx`; `gap-prove.spec.ts:F-AP-03` (check-in negative)         | Partial     | Drop-in attendance unit-tested; full happy-path "mark attended → commission split appears" is covered indirectly via commission-rule specs. |
| 24 | edit-reschedule               | `gap-prove.spec.ts:F-AP-05` (reschedule into trainer exception → conflict); `installment-reschedule.integration.test.ts`     | Partial     | Conflict path covered. Plain reschedule happy-path UI flow not asserted. |
| 25 | status-timeline               | `apps/server/src/tests/integration/status-history.test.ts` (writes appointment_status_history rows)                          | Partial     | Backend audit row write tested. UI timeline component display not asserted. |
| 26 | permission-redirect           | none                                                                                                                          | **Gap**     | "User without `appointment:read` → redirect or 403 page" not asserted in any UI spec. |
| 27 | class-slots-create-recurring  | none e2e; backend `services/class-slots.service.ts` has no integration test file                                              | **Gap**     | No spec covers creating a recurring class slot at the UI or service layer. |
| 28 | class-slots-booking-capacity  | `gap-prove.spec.ts:F-AP-01,F-AP-04,PC-AP-01` (capacity invariants)                                                            | Covered     | spotsBooked ≤ capacity invariant + can't shrink capacity below booked are asserted. |
| 29 | class-slots-cancel-cascade    | none                                                                                                                          | **Gap**     | Cancelling a class slot should cascade to its bookings — no spec asserts the cascade.                                  |

### Commissions UI (8)

| #  | Planned spec                  | Existing coverage                                                                                                             | Status      | Notes                                                                                                                  |
| -- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| 30 | my-tab                        | none                                                                                                                          | **Gap**     | "My commissions" tab filtering by `staffId = currentMember` is not asserted. |
| 31 | all-tab-filters               | none e2e; `commissionSplits.listLedger` is called in several specs                                                             | **Gap**     | Filter combos (status × date × staff × salesOrder) on the commission ledger UI are not asserted. |
| 32 | bulk-approve                  | `apps/web/src/__tests__/components/commissions/bulk-approve-dialog.test.tsx`                                                  | Partial     | Component unit test covers dialog + mutation call. Backend invariants (single staffId, ≤31-day spread) **not asserted at integration level** for the approve procedure. |
| 33 | bulk-mark-paid                | `e2e/payouts-confirm-creates-row.journey.spec.ts` (runBatch path)                                                              | Partial     | Payout batch creates rows is covered; explicit "mark as paid via UI" button → row status flips is not directly asserted. |
| 34 | void-dialog                   | `commission-rule.integration.test.ts:TC-CR-I006` (service-layer void); no UI                                                  | Partial     | Service-layer void covered; void dialog UI (with reason, status flip) is not asserted. |
| 35 | liability-tab                 | none                                                                                                                          | **Gap**     | The Liability tab (showing un-paid approved/pending splits as a financial liability) has no spec. |
| 36 | liability-mark-paid-batch     | `payouts-confirm-creates-row.journey.spec.ts`                                                                                 | Partial     | Run-batch payouts flow covered; "from Liability tab → batch mark paid" specific UI not asserted. |
| 37 | liability-csv-export          | none                                                                                                                          | **Gap**     | CSV export button click + download verification not asserted. |
| 38 | rbac-tabs-hidden              | none                                                                                                                          | **Gap**     | Non-admin commission tabs hiding not asserted. |

### Commission lifecycle invariants (6 from code-finding list)

| #  | Planned spec                  | Existing coverage                                                                                                             | Status      | Notes                                                                                                                  |
| -- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| L1 | cancelled-still-pays          | `commission-rule.integration.test.ts:TC-CR-I001`; `e2e/commission-rule-cancel-appointment.journey.spec.ts`                    | Covered     | Cancellation generates a `pending` split with `earnReason=cancellation`. |
| L2 | no-show-still-pays            | none directly                                                                                                                 | **Gap**     | The "no_show" status path is not explicitly tested. The integration tests only exercise `completed` and `cancelled` statuses. |
| L3 | dispute-voids-unpaid          | `commission-rule.integration.test.ts:TC-CR-I006` (void pre-delivery)                                                          | Partial     | Generic void path covered. Specific "dispute → void only non-paid splits, preserve paid ones" path is not asserted. |
| L4 | approve-batch-invariants (mixed-staff, >31-day) | none                                                                                                       | **Gap**     | The approve service-layer invariants (single staffId; ≤31 day spread) are not directly asserted in any test. |
| L5 | dedup-pos-vs-appointment      | `commission-rule.integration.test.ts:TC-CR-I003` (deferred service → split appears at completion); `appointment-commission.test.ts:TC-AC-003` (DB unique-index dedup) | Partial     | The DB unique-index guard against double-insert is tested. The **service-layer "skip if POS split already exists on the same salesOrderId"** branch is not exercised explicitly — code path is reached via TC-CR-I005's setup but not verified. |
| L6 | cancel-reopen-cancel (potential double-commission) | none                                                                                                  | **Gap**     | "Cancel an appointment → split created → reopen → cancel again" reproducing a potential double-commission bug is not asserted. |

### Refunds (5)

| #  | Planned spec                  | Existing coverage                                                                                                             | Status      | Notes                                                                                                                  |
| -- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| R1 | request-approve-process       | `installment-refund.integration.test.ts` (processRefund cancels remaining installments)                                       | Partial     | The `processRefund` step is well-covered. The two earlier steps (request + approve) at the service-layer state-machine are not separately asserted. |
| R2 | reject                        | none                                                                                                                          | **Gap**     | "Reject a pending refund request → status flips to rejected; no money moves" not asserted. |
| R3 | processed-reverses-commission | `commission-rule.integration.test.ts:TC-CR-I006` (void on pre-delivery sale cancel)                                           | Partial     | Generic reversal covered. The specific `reverseForRefund` call from the refund flow (not just `voidCommissionSplitsForSalesOrder`) is not asserted via a refund-driven test. |
| R4 | partial-line-item             | `refund-items.test.ts` (5 tests covering credit accounting, sequential, concurrent FOR UPDATE, validation)                    | Covered     | Excellent coverage of partial package-instance refunds. |
| R5 | target-priority (salesOrderId > paymentId > packageInstanceId) | none                                                                                         | **Gap**     | The refund's target-priority logic (which target field "wins" when multiple are present) is not asserted. |

### Customer entry (2)

| #  | Planned spec                  | Existing coverage                                                                                                             | Status      | Notes                                                                                                                  |
| -- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| C1 | customer-create-then-buy      | none; `apps/web/src/__tests__/pages/customers-v2-view.test.tsx` (page render only); commit 693744db introduced Quick Add flow | **Gap**     | The full Quick Add → POS prefill journey (Quick Add modal → submit → land on `/dashboard/sales/create?customerId=...` → cart pre-populated) is not asserted. |
| C2 | claim-link flow               | none                                                                                                                          | **Gap**     | The unclaimed customer claim-link flow added in commit 693744db has no spec — link generation, email send, recipient claims, role flip from `unclaimed` → `client` are all unverified. |

### Customer consumption (1)

| #  | Planned spec                  | Existing coverage                                                                                                             | Status      | Notes                                                                                                                  |
| -- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| K1 | package-session-consumption   | `refund-items.test.ts` reads `credits_used`/`credits_remaining` post-refund; no test ASSERTS that attendance-check-in increments these | **Gap**     | The "client attends an appointment booked against a package → `credits_used` increments by 1 → `credits_remaining` decrements" is the central consumption flow and is **not asserted at any layer**. |

## Net-new gaps (recommended to build)

### P0 — Business-critical paths that have ZERO assertion today

1. **`e2e/pos-walk-in-checkout.journey.spec.ts`** (#3) — Walk-in customer cash sale through the UI; assert SOI rows have `customerType="walk_in"`. **M** complexity (needs UI test-ids on the walk-in step).

2. **`e2e/customer-quick-add-to-pos.journey.spec.ts`** (#8, C1) — Open Quick Add modal from any page → submit minimal customer → navigate to POS with customer prefilled. **S–M** complexity; commit 693744db just landed this flow so test-ids likely exist.

3. **`apps/server/src/tests/integration/commission-approve-invariants.test.ts`** (L4) — Service-level: `approveCommissionSplits` rejects mixed-staff batch with `BAD_REQUEST`; rejects >31-day spread with `BAD_REQUEST`; accepts single-staff ≤31-day. **S** complexity.

4. **`apps/server/src/tests/integration/package-credit-consumption.test.ts`** (K1) — Insert package instance with credits=10 → check-in to attached appointment → assert `creditsUsed=1` and history row. **M** complexity (needs to wire the check-in service hook).

5. **`apps/server/src/tests/integration/no-show-still-pays.test.ts`** (L2) — Set appointment to `no_show` → assert commission split exists with `earnReason="no_show"` (or equivalent). **S** complexity; replicate from TC-CR-I001.

### P1 — Important edge paths

6. **`apps/server/src/tests/integration/commission-dedup-pos-vs-appointment.test.ts`** (L5) — Sequence: POS service sale with `itemTrainerAssignments` creates split → linked appointment marked completed → assert NO second split is inserted; log line / `splitType=skipped_existing_pos`. **M** complexity.

7. **`apps/server/src/tests/integration/cancel-reopen-cancel.test.ts`** (L6) — Appointment cancelled → split created → status set back to `scheduled` → cancelled again → assert exactly one cancellation split exists. **M** complexity.

8. **`apps/server/src/tests/integration/refund-target-priority.test.ts`** (R5) — Refund row with all three target fields populated; verify the resolved target. **S** complexity.

9. **`apps/server/src/tests/integration/refund-state-machine.test.ts`** (R1, R2) — Request → approve → process (each step asserts status flip + audit row); separate test for request → reject. **S** complexity.

10. **`e2e/commissions-my-tab-narrowing.journey.spec.ts`** (#30) — Log in as a trainer role; navigate to commissions; assert only that trainer's splits visible. **M** complexity (needs seed for a trainer user with their own splits; coordinates with #38).

11. **`e2e/commissions-bulk-approve-invariants.journey.spec.ts`** (#32, surfacing L4 at UI) — Multi-select mixed-staff splits → bulk-approve → assert error toast. **M** complexity.

12. **`e2e/commissions-void-dialog.journey.spec.ts`** (#34) — Void dialog flow with reason → assert row moves to Voided filter. **S** complexity.

13. **`e2e/class-slot-cancel-cascade.journey.spec.ts`** (#29) — Create class slot, book 2 attendees, cancel slot → assert both bookings cancelled. **M** complexity.

14. **`apps/server/src/tests/integration/pos-permission-and-suspended.test.ts`** (#15, #16) — recordSale called by user without `pos:create` → 403; recordSale on `paymentStatus="suspended"` org → 403. **S** complexity.

### P2 — Polish / nice-to-have

15. **`e2e/pos-cash-tender-with-change.journey.spec.ts`** (#4) — Cart total RM100, tender RM150 → change RM50 displays. **S** complexity.

16. **`e2e/pos-clear-cart-confirm.journey.spec.ts`** (#11) — Add items → click Clear → confirm dialog → cart empty. **S** complexity.

## Surprises / things the audit revealed

- **`commission-rule.integration.test.ts` is excellent**. 7 tests with proper FK-aware cleanup and clear naming (TC-CR-I001..I007). It already covers items 17, 19, L1 (cancelled-still-pays), the void preservation rule for delivered appointments, and the commissionDeferred column persistence. Builders should mirror this file's shape for the gap tests.

- **`gap-prove.spec.ts` is wide but shallow**. It touches ~25 distinct findings, but every assertion is `expect.soft()` and most steps are guarded with try/catch that fall through to `expect.soft(true).toBe(true)`. This is **not** a regression net; it's an executable runbook of known issues. The audit should NOT treat any soft step as "covered" — only the integration tests count.

- **`e2e/pos-checkout-non-client-member-error.journey.spec.ts` currently SKIPS** because `searchPosCustomers` filters out non-client members so the spec can never click an admin row. This is a real test gap masked as "covered" — needs a seed helper for a non-client member visible in search.

- **`e2e/payouts-confirm-creates-row.journey.spec.ts` documents** that `createManualAdjustment` is blocked by `commission_splits_must_target_one` CHECK constraint. This is a **schema-level issue** the test surfaces but doesn't fix. Worth a separate fix-task for the audit-prove session.

- **Duplicate-ish coverage at the calculator layer**: `commission-calculator.test.ts` and `appointment-commission.test.ts` both test similar `calculateCommissionForAppointment` paths. The former is more thorough (5 tests, including unfilled-slot redistribution). The latter (3 tests) is the only place where the DB unique-index dedup (TC-AC-003) is asserted. Both are useful; no consolidation needed.

- **No frontend tests** for the POS multi-step wizard (`apps/web/src/components/pages/sales/*`). The `__tests__/pages/sales-view.test.tsx` only covers the *list* view, not the *create* flow.

- **No spec exercises the `recordPosSale` `itemTrainerAssignments` parameter end-to-end through the UI**. The integration tests (`pos-commission.test.ts:TC-POS-001`) use it via the service function directly. The e2e specs that call `recordPosSale` (helper in `seed-data.ts`) do not pass `itemTrainerAssignments`. So the "POS-time commission creation with assignment picker" UI is unverified.

- **`refund-items.test.ts` (5 tests)** is a model for concurrent-update testing — the `FOR UPDATE` race scenario is well asserted. Replicate this approach when writing the cancel-reopen-cancel test (L6).

## Seed gaps

The following seed data is required for the recommended new tests:

1. **Non-client member visible in `searchPosCustomers`** — needed to make `pos-checkout-non-client-member-error` actually run. Currently `searchPosCustomers` filters to `role=client`, so the admin is never found. Either:
   - Add a seed helper `seedNonClientPosVisibleMember` in `e2e/helpers/seed-data.ts`, or
   - Relax `searchPosCustomers` to include `client + walk_in` and let the route guard fail at checkout (test stays at UI layer).

2. **Trainer member with own commission splits** — for #30 (my-tab) and #38 (rbac-tabs-hidden). Add a seed that creates a trainer-role member + a completed appointment in their name + the resulting split.

3. **Walk-in customer fixture** — `seedWalkInCustomer` helper that POSTs to `walkInCustomers.create` and returns `{ id, name, branchId }` for use by #3 / `pos-walk-in-checkout`.

4. **Multi-staff commission splits across many days** — for L4 (approve invariants). Need a helper that seeds 3 splits: same staff within 31 days (legal), mixed staff (illegal), single staff >31-day spread (illegal). This goes in `apps/server/src/tests/helpers/fixtures.ts`.

5. **Refund row with multiple target fields populated** — for R5. Should be inserted directly via `tenantDb.insert(refunds)` with all of `salesOrderId`, `paymentId`, `packageInstanceId` set, to verify priority logic.

6. **Class slot with capacity + bookings** — for #29 (cancel-cascade). Need `seedClassSlotWithBookings(capacity, attendeeCount)`.

**Confirmed already adequate:**
- `seed-commission-config.ts` — covers the baseline tier + category-config + tier-rate seeding the commission tests need. Idempotent and reliable.
- `seed-business-data.ts` — covers service category, service, package, member, hierarchy node. Used by most e2e and integration tests via `seedMinimalPosFixture` and `e2e/helpers/seed-data.ts`.
- `seed-customers.ts` — covers registered customers (3 fixtures). Useful for the customer-flow E2E specs.
- `seed-trainers.ts` — covers trainer-role members.

## Recommended build order (if proceeding with gap-fill)

Phase A (service-layer, fast, no UI): tests #3, #4, #5, #7, #8 → unblocks confidence in the lifecycle.
Phase B (seeds): items 1, 2, 4 from seed-gaps section → enables Phase C.
Phase C (E2E happy paths): tests #1, #2, #10, #13 → covers the highest-traffic UI flows.
Phase D (polish): remaining gaps as time allows.
