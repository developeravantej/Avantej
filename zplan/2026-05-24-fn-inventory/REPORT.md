# Codebase Function Inventory & Gap Report

**Date:** 2026-05-24
**Scope:** All 52 tenant oRPC routers + server/platform-admin routers + ~80 service files.
**Method:** 6 parallel domain audits (general-purpose agents), each producing a detail file in `codebase-functions/`. Top-impact findings re-verified by the orchestrator against source.

> **How to read this:** This is the executive layer. Per-procedure tables and full gap lists live in the six domain files:
> - `codebase-functions/01-money-flow.md` — POS, sales-orders, invoices, installments, refunds, payouts, payments
> - `codebase-functions/02-commissions-promo-tax.md` — commission-splits, category-commission, promotions, tax
> - `codebase-functions/03-packages-scheduling.md` — package-instances, appointments, class-slots, check-ins, waitlist, trainer-availability, memberships
> - `codebase-functions/04-inventory-purchasing.md` — products, suppliers, purchase-orders, goods-receipts, stock/transfer, brands, rooms
> - `codebase-functions/05-people-rbac-catalog.md` — members, hierarchy, roles/permissions, customers, services catalog, invitations
> - `codebase-functions/06-platform-admin-integrations.md` — platform-admin, subscriptions, Stripe Connect, GHL, notifications, analytics, calendar

---

## 0. Verification legend

- ✅ **Verified** — orchestrator re-read source / ran the check first-hand.
- 📋 **Agent-reported** — from a domain audit with `file:line` evidence, not independently re-verified.
- ⚠️ **Corrected** — agent claim that orchestrator verification changed.

---

## 1. Critical infrastructure findings (verified)

### 1.1 ✅ `packages/api` is NOT type-checked by CI — the whole oRPC surface is ungated
The `bun check-types` gate (turbo) only runs `tsc` in packages that define a `check-types` script: **server, web, native**. Evidence:
- `packages/api/package.json` scripts = `{ build: "tsdown", test: "bun test src" }` — **no `check-types`**.
- `apps/server/tsconfig.json` has **no `references`** to api.
- `packages/api` `exports` map resolves `types` → **`./dist/*.d.ts`** (pre-built declarations), so web/server compile against stale built `.d.ts`, never api source.

**Consequence:** type errors in api source `.ts` (router handlers) never turn CI red. They are only caught if someone runs `tsdown` (build) or `tsc -b` locally in `packages/api`.

**Fix:** add `"check-types": "tsc -b"` to `packages/api/package.json` (and `packages/services`, `auth`, `db`, `types` if similarly ungated) so turbo includes them. Then fix the backlog below before re-enabling the gate.

### 1.2 ✅ A forced clean `tsc -b` in `packages/api` surfaces real, build-breaking errors
These are genuine `TS2304`/`TS2345`/`TS7056` errors (not just unused-import noise), introduced by the in-flight **router-split refactor** (see recent `refactor(api): trim ... split module imports` commits):

| File:line | Error | What's broken |
|---|---|---|
| `routers/appointments/crud.procedures.ts:177` | TS2304 `Cannot find name 'getAppointmentById'` | `appointments.update` references an unimported helper |
| `routers/package-instances/assign.procedures.ts:276` | `inArray` used, only `eq` imported (line 11) | `bulkAssign` won't compile |
| `routers/package-instances/assign.procedures.ts:313-316` | `trainerMember` referenced but never declared in `bulkAssign` (schema only has `trainerMemberId`) | `bulkAssign` writes `preferredTrainerId`/`assignedTrainerId` from an undefined var |
| `routers/hierarchy/members.procedures.ts:207` | TS2304 `Cannot find name 'ControlPanelDb'` | type ref lost in split |
| `routers/hierarchy/move.procedures.ts:146` | TS2304 `Cannot find name 'ControlPanelDb'` | type ref lost in split |
| `routers/households.ts:45` | TS2345 `{}` not assignable to `TenantDb` | service called with empty object |
| `routers/memberships.ts:48` | TS2345 `{}` not assignable to `TenantDb` | service called with empty object |
| `routers/google-calendar.ts:151` | TS2345 missing `organizationId` arg | `syncNow`-adjacent call malformed |
| `routers/index.ts:12` | TS7056 inferred type too large to serialize | root router needs an explicit type annotation |

Plus a large tail of `TS6133` (unused imports left by the "trim imports" passes) across ~15 router files. These are low-severity but confirm the refactor is mid-flight and unverified.

### 1.3 ✅ The cold CI gate IS currently red — on `apps/native`
A cache-cleared `bun check-types` exits **2**, failing on:
- `apps/native/app/(app)/dashboard/explore/[id].tsx:352` — `ServiceWithCategory[]` not assignable to `RelatedService[]` (`price: number | null` vs `number`).

This is the *only* error CI actually catches today; everything in §1.2 slips through because of §1.1. **The local incremental cache (`.tsbuildinfo`) was masking even this** — `bun check-types` reported a stale pass until the cache was cleared.

---

## 2. Cross-cutting themes (every domain hit these)

1. **`zhub/shared/api-overview.md` is badly stale** (all 6 domains). It claims 52 routers / understates procedure counts everywhere: installments 3→12, payouts 1→5, sales-orders 6→9, members 8→13, commission-splits 9→15; omits the entire server `payments` router (9 procs) and **all** `platform-admin-*`/`subscriptions`/`stripe-connect`/`ghl`/`scheduled-reports`/`onboarding` routers (~80 procedures uncatalogued). It also lists nonexistent procedures (`trainer-tiers.delete`, service-members `assign`/`updateBuffer`) and mislabels others (goods-receipts `list` is really `listForPo`). **Regenerate it.**

2. **Orphaned (dead) service functions** — written + often unit-tested, but no router/cron calls them:
   - `processCommissionReversals` (`payouts.service.ts:38`) ✅ — commission clawback runner, zero callers.
   - `markExpiredInvitations` (invitation service) 📋 — no cron; invites never flip to `expired`.
   - `getConfigsMissingRateForTier`, `checkHierarchyPermission`, `dispatchProfileSync` (ghl), `incrementBooking`/`decrementBooking`/`resolveClientDisplayName`/`parseVirtualId` 📋.

3. **Missing side-effects (silent data drift):**
   - ✅ **POS/sales never decrement product stock** — `pos.service.ts` and `sales-order.service.ts` have **zero** stock references; goods-receipts only ever *increment*. Inventory monotonically climbs.
   - 📋 **Tenant notifications have no delivery channel** — `notification.service.ts` only INSERTs rows; no email/push/SMS send; `notificationPreferences` toggles have no consumers (dead config).
   - 📋 **`user_activity_log` has a reader but no writer** — the "Recent Activity" widget is permanently empty.

4. **Lifecycle dead-ends** (status values nothing can reach/leave): refund `cancelled` (no withdraw path), partially-received POs (can't close/cancel), `cancelTransfer` on a completed transfer doesn't reverse stock, appointment `no-show` vs `no_show` string mismatch killing commission branches. See domain files.

5. **RBAC gaps** 📋 — `role_permissions.scope` (own/team/branch) is stored but `hasPermission` never reads it (all grants act org-wide); permission assignment is role-level only (no per-member grants); `organizationSettings.upsert` hard-codes `role==='admin'` instead of the permission system; `coach-intake.unclaimSlot` has no permission gate.

---

## 3. Installments — focused analysis (the feature you asked about)

**Bottom line: installments is one of the *more* complete features, not a thin one.** The stale catalog (3 procedures) is misleading.

**What exists** (`installment.service.ts`, 20 exported fns + `installments` router 12 procs + `installment-plans` router full CRUD):
- Schedule creation (`createInstallmentSchedule`), credit-unlock math (`calculateCreditsUnlocked`), amount split (`calculateInstallmentAmounts`).
- Payment confirmation (`confirmInstallmentPayment`), refund (`processRefund`, `getSuggestedRefund`, `calculateSuggestedRefund`).
- Lifecycle: `evaluateAndLockIfOverdue` → grace period → lock; `evaluateAndExpireIfOverdue`; `unlockPackage`; `syncPackagePaymentStatus`.
- Admin ops: `waiveInstallment`, `rescheduleInstallment`, `adjustCredits`, `resetCreditsOverride`, `setPackageOverdraft`, `getAdminInstallmentOverview`.
- **Cron sweep exists**: `apps/server/src/services/installment-sweep.service.ts:89` calls `evaluateAndLockIfOverdue` per overdue package.
- POS auto-confirms installment #1 at the counter (`pos.service.ts` step 13c).

**⚠️ Corrected agent claim:** Domain-01 reported "overdue packages lock but never expire (expire is orphaned from the cron)." **This is wrong** — `evaluateAndLockIfOverdue` calls `evaluateAndExpireIfOverdue` first (`installment.service.ts:511`), and the lock path is the cron's entry point. Expiry **does** run via the sweep.

**Real installment gaps that remain** (several already scoped in existing `zplan/05-17_*` sessions — not yet executed):
- ✅ **`evaluateAndLockIfOverdue` marks only the *first* overdue installment** (`installment.service.ts:530`, `findFirst` not bulk UPDATE) — packages with multiple missed installments are misrepresented. (Tracked as H12 in `zplan/05-17_21-30_installment-residual-fixes`.)
- **No upcoming/overdue payment reminder notifications** — ties into theme §2.3 (no notification delivery channel at all).
- **`listByPackageInstance` fires `evaluateAndLockIfOverdue` as a side-effect on every open** — "lock mid-browse" hazard; redundant once the cron is trusted.
- **No member-facing "pay this installment online" flow** — installment #2..N can only be confirmed by staff (`confirmInstallmentPayment`); no Stripe payment-link path for the customer.
- **Catalog lists 3 of 12 procedures** — frontend devs can't discover `waive`/`reschedule`/`unlock`/`overview` from docs.

---

## 4. Per-domain gap highlights

### 01 — Money flow 📋✅
- ✅ `processCommissionReversals` dead (no caller).
- 📋 **Two disconnected refund systems**: `payments.refund` (server) issues Stripe refunds but writes nothing to the `refunds` ledger; `refunds.process` writes the ledger but moves no money. No bridge → Stripe-refunded sales never appear in refund reports.
- 📋 Refund `cancelled` status unreachable (no withdraw path), `refunds.service.ts:115`.

### 02 — Commissions / promo / tax 📋
- `markPaidById` **silently drops `paymentReference`** (accepted by schema, written nowhere) — `lifecycle.procedures.ts:218`.
- Promotions half-implemented: `validatePromoCode` ignores product/service applicability; `free_item`/`buy_x_get_y` just apply a flat cents discount (no real logic), `promotions.service.ts:151`.
- validate→apply **TOCTOU**: `applyPromotion` trusts client `discountAmount`, bumps `usageCount` with no re-validation / no `usageLimit` guard / no row lock — limits bypassable, `promotions.service.ts:161`.
- `void`/`voidById` are exact duplicates.

### 03 — Packages / scheduling 📋 (+ §1.2 compile breaks live here)
- 📋 **`no-show` vs `no_show` mismatch** — appointments persist `no-show` (hyphen), but `appointment.service.ts` keys commission + reassign-guard + attendee logic on `no_show` (underscore) → those branches are dead code (incl. POS-deferred commission for no-show services).
- 📋 **Freeze conflict** — `freezePackageInstance` sets `frozen`, `memberships.freeze` sets `paused` + a hold row; status enum omits `paused` → membership-frozen packages can't be unfrozen via `packageInstances.unfreeze`.
- 📋 **Waitlist promotion incomplete** — `promoteFromWaitlist` flips the entry + bumps counters but creates no appointment/appointmentClient → promoted member holds a seat with no booking.
- 📋 Two membership service files (`membership.service.ts` + `memberships.service.ts`) — duplication.

### 04 — Inventory / purchasing ✅📋
- ✅ POS never decrements stock (see §2.3).
- 📋 `partially_received` PO can't be force-closed or cancelled (`cancel` allows only draft/approved).
- 📋 Legacy `receiveItems` bumps PO status/receivedQty **without** moving stock (diverges from `goodsReceipts.create`).
- 📋 `cancelTransfer` can cancel a *completed* transfer without reversing moved stock; `fulfillStockRequest` always marks `fulfilled` (no partial / no precondition); stock-request & transfer status are free-text (no enum).
- 📋 Hard deletes of UoM/brand/category with no in-use guard (UoM is NOT NULL on products); `product_stock.quantity` has no ≥0 floor.

### 05 — People / RBAC / catalog 📋 (+ §1.2 households/memberships/hierarchy breaks)
- 📋 **`service-members.ts` copy-paste bugs**: `listForMember:149` runs an INSERT referencing `input.serviceId` (not in its schema) → never lists; `remove:192` branches on `input.bufferTimeMinutes` (not in schema) → never unassigns.
- 📋 `markExpiredInvitations` has no cron (invites never expire); `walk-in-customers` is a hollow deprecated router (throwing stubs except `convertToPackage`); `households` lacks update/delete.
- 📋 RBAC scope ignored (see §2.5).
- ✅ **Stale MEMORY note corrected:** `route-guards.requirePermission` is **fully implemented** (`route-guards.ts:85`), not a stub. Update `feedback_stale_permission_cache.md`/memory.

### 06 — Platform-admin / integrations 📋
- 📋 Tenant notifications DB-only (see §2.3); platform-admin tenant-DMs DO send real Resend email (asymmetry).
- 📋 Platform-admin MRR/revenue/renewals use placeholder `TIER_PRICES_USD_CENTS`, not actual Stripe amounts.
- 📋 `googleCalendar.syncNow` only bumps `updatedAt` (no real sync/backfill); `orgStatus` returns null events/conflicts.
- 📋 `onboarding` downgrades 410 GONE → 404.

---

## 5. Prioritized "what needs to be added / fixed"

### P0 — Build & gate integrity (do first)
1. Fix the 9 api compile errors in §1.2 (router-split fallout) — or revert/complete the split.
2. Fix `apps/native` explore-page type error (§1.3) — CI is red.
3. Add `check-types` scripts to ungated packages (api, services, …) so the gate actually covers them (§1.1).

### P1 — Correctness / money integrity
4. Wire product-stock decrement into POS/sales (§2.3) — currently inventory is wrong for every sale.
5. Bridge the two refund systems (Stripe ↔ refunds ledger) (§4-01).
6. Fix promotion TOCTOU + usageLimit enforcement + applicability (§4-02).
7. Fix `no-show`/`no_show` mismatch (re-enables no-show commission) (§4-03).
8. Fix `service-members` `listForMember`/`remove` copy-paste bugs (§4-05).
9. Stop `markPaidById` dropping `paymentReference` (§4-02).

### P2 — Completeness / lifecycle
10. Notification delivery channel (unblocks installment reminders, all toggles) (§2.3).
11. Installment multi-overdue bulk sweep + customer self-pay link (§3).
12. PO close/cancel for partially-received; transfer-cancel stock reversal; stock-request partial fulfill (§4-04).
13. Wire orphan crons: `markExpiredInvitations`; decide fate of `processCommissionReversals`.
14. RBAC scope enforcement in `hasPermission` (§2.5).

### P3 — Hygiene
15. Regenerate `zhub/shared/api-overview.md` (§2.1); update stale memory note (§4-05).
16. Dedupe `void`/`voidById`, the two membership service files; remove orphan service fns or expose them.

---

## 6. Notes on confidence
- §1 (infrastructure), §2.3 (stock), §3 (installments correction), and the `route-guards` stub correction were re-verified first-hand.
- Domain-specific gaps in §4 carry `file:line` evidence from the audits but were not all independently re-read; treat P1/P2 items as "strong leads, confirm the reproduction before fixing" per the bug-fix protocol.
- Several P2 installment items are already scoped (unexecuted) in `zplan/05-17_20-46_installment-system-completeness` and `zplan/05-17_21-30_installment-residual-fixes`.
