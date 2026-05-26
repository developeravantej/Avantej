# Domain packages-services-trainers

Audit Date: 2026-05-26  
Stack: tanstack-router + oRPC + drizzle + better-auth  

## Endpoints / Procedures Summary

Total endpoints: 48 across 8 routers (package-instances, package-instance-staff, services, service-categories, service-category-config, service-members, category-buffer-overrides, trainers, trainer-tiers, memberships)

All endpoints implement full CRUD + lifecycle transitions. **No missing major surface areas.**

---

## Gaps (prioritized P1/P2/P3)

### P1 — No Background Job for Auto-Expiry [status: missing | testable: false]

**Issue:** Package instances remain status=active indefinitely past expiresAt.
- evaluateAndExpireIfOverdue() exists in installment.service.ts:475
- Called only during installment overdue check, not on a schedule
- No daily cron marks active packages expired when expiresAt < NOW()

**Impact:** Inflated active membership counts, stale data in retention dashboards, customers can use credits past expiry.

**Fix:** Create packages/workers/expire-packages.ts or Cloudflare Worker to:
1. Query active packages where expiresAt < NOW()
2. Call evaluateAndExpireIfOverdue on each
3. Log audit trail

**Testable:** false (requires background infrastructure)

---

### P1 — First Installment Auto-Confirmed Without Payment Proof (approve.procedures.ts:300-349) [status: partial | testable: true]

**Issue:** bulkApprove unconditionally confirms first installment for multi-installment packages if installmentsPaid == 0.
- Assumes staff already captured payment outside system
- No receipt, method, or proof is recorded before crediting customer
- Can result in orphaned paid=1 but no actual payment

**Fix:** Add field to bulkApprove input:
- confirmPaymentMethod?: "manual_transfer" | "paid_receipt"
- If installmentsTotal > 1 and method missing, reject

**Testable:** true

---

### P1 — Freeze/Resume Status Mismatch (memberships.ts vs lifecycle.procedures) [status: partial | testable: true]

**Issue:** Two code paths manage frozen state:
- freeze() / unfreeze() in lifecycle.procedures.ts use status="frozen"
- freezeMembership() / resumeMembership() in memberships.ts use membership_holds table
- They can race: both write packageInstances row, last write wins, audit lost

**Fix:** Consolidate: either
- Option A: freeze/unfreeze own status column only (forbid memberships freeze)
- Option B: memberships freeze owns it all, lifecycle freeze is deprecated
- Document canonical source for UI

**Testable:** true (concurrent freeze+resume should not lose audit)

---

### P2 — setBranchPrice Does Not Validate Branch Access for null (pricing.procedures.ts:92-100) [status: missing | testable: true]

**Issue:** guardInputBranchForContext only rejects if branchId provided AND out of scope.
- Caller can pass branchId: null to set org-wide price
- Regional admin with one-branch access can override global prices

**Fix:** If branchId is null, check caller.role === "admin" or add canManageGlobal permission.

**Testable:** true (regional admin tries to set global → should reject)

---

### P2 — Trainer Tier Commission Rates Not Auto-Created (trainer-tier.service.ts:48-76) [status: partial | testable: true]

**Issue:** createTrainerTier returns missingRateCategories but does NOT auto-create commission_tier_rates rows.
- Frontend must manually configure rates for each category
- If rates not set, commission calc fails when trainer has sessions
- No scaffolding to guide staff through rate config

**Fix:** Auto-create commission_tier_rates rows with rate=0 (stub), mark needsReview=true.

**Testable:** true (create tier → verify commission_tier_rates exist with rate=0)

---

### P3 — No Bulk Update for Package Instances (CRUD Enhancement) [status: missing | testable: false]

**Issue:** No bulkUpdate endpoint to change status/extend/etc on multiple packages.
- Use case: extend all expiring packages by 30 days = 100 API calls vs 1

**Fix:** Add bulkUpdate to lifecycle.procedures (soft enhancement, not critical)

**Testable:** false (not a correctness gap)

---

## Testable Findings Count

**testable: true** = 4
1. First installment payment proof
2. Freeze/resume race condition
3. setBranchPrice branch access (null case)
4. Trainer tier commission rates

**testable: false** = 2
1. Auto-expiry background job
2. Bulk update enhancement

**Status breakdown:**
- implemented: 44 endpoints + 20 logic functions
- partial: 3 (payment proof missing, freeze mismatch, tier rates)
- missing: 2 (auto-expiry job, bulk update)

