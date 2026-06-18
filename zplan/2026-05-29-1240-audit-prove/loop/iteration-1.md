# Iteration 1 — Tier-1 remediation

Gate before: GREEN. 7 parallel file-disjoint fix agents. Gate after: GREEN. Lint: 0 errors. Unit: 112 pass / 5 fail — the 5 fails are PRE-EXISTING (identical on stashed HEAD), zero new regressions.

## Targets resolved (22 fixed + 1 already-fixed = 23)

| ID | Result | Change |
|----|--------|--------|
| F-CRM-03 | fixed | promotions.service.ts validatePromoCode now enforces applicableProductIds/applicableServiceIds (intersection check) |
| F-CRM-06 | fixed | validatePromoCode enforces promotion.branchId scope |
| F-CRM-04 | fixed | applyPromotion atomic conditional UPDATE guards usageLimit; usage row inserted only after increment |
| F-SVC-01 | fixed | promoteFromWaitlist enqueues notifyWaitlistPromotion (best-effort) |
| F-SVC-04 | fixed* | cancelClassSlot loops promoteFromWaitlistInsideTx; caveat: cancelled-slot guard correctly prevents promotion into a dead slot |
| F-SVC-09 | fixed | incrementBooking → atomic conditional UPDATE (WHERE spotsBooked < capacity AND !isCancelled) |
| F-CRM-05 | fixed | removeFromWaitlist compacts remaining positions in a tx |
| F-CRM-10 | fixed | addToWaitlist locks slot row FOR UPDATE before isFull check + insert |
| F-AUTH-09 | fixed | listNodes now calls requirePermissionOrpc(hierarchy_management, read) |
| F-AUTH-07 | fixed | invitation resend 5-min cooldown (derived from expiresAt; no schema change); maps to TOO_MANY_REQUESTS |
| F-AUTH-08 | fixed | suspend/reactivate dispatch GHL sync (operation update), best-effort |
| F-AUTH-04 | fixed | member remove revokes pending invitations by email (status declined) |
| F-INV-08 | fixed | createTaxRate + updateTaxRate validate effectiveUntil > effectiveFrom |
| F-INV-07 | fixed | deactivateSupplier rejects when active POs (approved/ordered/partially_received) exist |
| F-INV-02 | fixed | cancelReceipt writes audit (action goods_receipt.cancel); caller updated to pass actor |
| F-COM-04 | already-fixed | POS path already routes through _buildSplits→applyCommissionCaps (prior commit 4d45c7b2); no change |
| F-COM-09 | fixed | createOnboardingUrl guards partner hierarchyScopeId against accessibleNodeIds |
| F-COM-07 | fixed | liabilityByStaff returns { rows, totalCount, hasMore }; sentinel-row overflow detection; 2 e2e specs updated |
| F-SVC-06 | fixed | splitSeries schema .refine rejects endsOn before fromDate |
| F-SVC-08 | fixed | service-category-config rejects bufferTimeMinutes > defaultDuration (limitation: no per-service duration here) |
| F-SVC-05 | fixed | updateAppointment re-checks package lock on forward status transitions |
| F-CRM-09 | fixed | convertWalkInPaymentToPackage asserts walk-in customer matches packageInstances.clientId (FORBIDDEN otherwise) |
| F-CRM-07 | fixed | upsertCustomerProfile single-statement onConflictDoUpdate (race eliminated) |

## Files touched outside owned sets (declared, no conflicts)
- packages/api/src/routers/goods-receipts.ts (Batch D — sole cancelReceipt caller, pass actor)
- e2e/gap-prove-commission.spec.ts, e2e/gap-prove-commission-deep.spec.ts (Batch E — liabilityByStaff shape)

## Pre-existing issues (NOT from this run, verified via stash of HEAD)
- apps/server unit: db.ts + services-barrel module-eval "Export not found" (4 barrels), email.test Resend key, stripe-connect atob — 5 fail, identical on clean HEAD.

Exit reason: Tier-1 worklist resolved. Deferred S- items remain for human review.
