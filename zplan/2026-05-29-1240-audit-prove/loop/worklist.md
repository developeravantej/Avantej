# Verified Remediation Worklist (2026-05-29)

56 raw findings → 33 verified real bugs after parallel verification.
Filtered out: 9 false, 6 overstated/by-design, 2 product-design, 1 duplicate.

## TIER 1 — High-value, low-risk, NO schema change (REMEDIATE NOW)

### Batch A — Promotions enforcement (owner: promotions.service.ts)
- F-CRM-03 (small) promo applicableProductIds/applicableServiceIds NOT enforced in validatePromoCode/applyPromotion
- F-CRM-06 (small) promo branchId scope NOT validated
- F-CRM-04 (small) applyPromotion re-checks isActive but NOT usageLimit under tx (oversell race)

### Batch B — Waitlist + class-slot lifecycle (owner: waitlist.service.ts + class-slots.service.ts)
- F-SVC-01 (small) promoteFromWaitlist sends no notification
- F-SVC-04 (med)  cancelClassSlot does not promote/notify next waitlist entry
- F-SVC-09 (small) incrementBooking not transactional (capacity race)
- F-CRM-05 (med)  removeFromWaitlist doesn't recompute positions
- F-CRM-10 (small) addToWaitlist checks stale slot.isFull (over-capacity race)

### Batch C — Auth/Members RBAC + lifecycle (owner: members/*, invitations/*, hierarchy/read)
- F-AUTH-09 (trivial) listNodes missing requirePermissionOrpc
- F-AUTH-07 (small) invitation resend has no rate limiting
- F-AUTH-08 (small) suspend/reactivate don't dispatch GHL sync (deactivate does)
- F-AUTH-04 (small) member removal doesn't revoke pending invitations

### Batch D — Inventory validation/audit (owner: suppliers/tax-rates/goods-receipt services)
- F-INV-08 (trivial) createTaxRate no effectiveUntil > effectiveFrom validation
- F-INV-07 (small) deactivateSupplier no active-PO check
- F-INV-02 (small) cancelReceipt missing writeAudit

### Batch E — Commissions correctness + RBAC (owner: commission-calculator/commission-splits/partner-stripe)
- F-COM-04 (med) POS commission path bypasses applyCommissionCaps (appointment path applies them)
- F-COM-09 (small) createOnboardingUrl missing guardBranchAccessible
- F-COM-07 (small) liabilityByStaff silent LIMIT 500 truncation (add total/hasMore)

### Batch F — Appointments/scheduling validation (owner: appointment.service/recurrence/service-category-config)
- F-SVC-06 (small) splitSeries doesn't validate endsOn >= fromDate
- F-SVC-08 (small) service-category-config allows buffer > service duration
- F-SVC-05 (med) updateAppointment doesn't re-check package lock on status transition

### Batch G — CRM data-integrity/security (owner: walk-in.service/customer-profile.service)
- F-CRM-09 (small) **SECURITY** convertWalkInPaymentToPackage no client_id owner check (cross-customer)
- F-CRM-07 (med) upsertCustomerProfile not transactional (upsert race)

## DEFERRED (S-) — needs schema migration, product decision, or large refactor (HUMAN REVIEW)
- F-SALE-09 cancellation number race → needs tenant migration (CREATE SEQUENCE). Schema change.
- F-INV-06 adjustStock no audit trail → needs new stock_movements table. Schema change.
- F-INV-05 transfer order acceptance state → needs new status + workflow. Schema + product.
- F-SALE-08 package expiry cron → needs new cron + wrangler wiring + service.
- F-COM-01 manualAdjustment has no UI → frontend feature, not a backend bug.
- F-COM-05 permission split blocks self-approve → permission-model product decision.
- F-COM-02 confirmViaStripe router-level validation → service layer already validates (redundant hardening).
- F-CRM-08 coach intake ignores trainer calendar → large cross-service join.
- F-CRM-02 creditPoints never consumed → product-design (loyalty feature not built).
- F-AUTH-03 base accept customer_profiles stub → server override already handles; needs care re: base contract.
- F-AUTH-05 hierarchy node deletion notification → depends on notification subsystem design.
- F-INV-04 supplier invoice update endpoint → by-design immutability; product decision.
