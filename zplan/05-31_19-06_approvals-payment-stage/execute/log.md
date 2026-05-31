# Execute log — approvals payment stage

## 2026-05-31 — Q6 = Option A; Phase 1 implemented

**Decision:** Q6 → Option A (ship payment stage; webhook approval-bypass filed as separate follow-up). Recorded in plan §8.

### Phase 1 — Awaiting-payment stage + confirm (DONE, type-check + lint green)
Backend:
- `apps/web/src/features/approvals/approvals.types.ts` — `ApprovalStatus` += `"awaiting_payment"`.
- `packages/api/src/routers/package-instances/pending.procedures.ts` — `listPending` enum += `awaiting_payment`; WHERE reworked to an **independent payment gate** (awaiting = `status != cancelled` + `paymentStatus IN (pending,failed)` + `source=purchased`; pending tab unchanged = `paid/partially_paid`); added `ne` import.
- `packages/api/src/routers/package-instances/confirm-payment.procedures.ts` — **new** `packageInstances.confirmPayment`. Method-aware (blocks `stripe` — gateway auto-confirms), idempotent (`FOR UPDATE` + re-check; returns `alreadyConfirmed`), Branch A delegates to `confirmInstallmentPayment` (earliest pending installment), Branch B marks single payment paid + audit. Mutates `paymentStatus` only, never `status`. Post-confirm fires `notifyStaffOfPendingPackage` when `status=pending`.
- `packages/api/src/routers/package-instances/index.ts` — merged new procedures.
- Rebuilt `packages/api` dist (web consumes types).

Frontend:
- `FilterBar.tsx` — "Awaiting payment" pill (orange), first.
- `ConfirmPaymentDialog.tsx` — **new** approvals dialog (offline method select + notes) → `client.packageInstances.confirmPayment`.
- `ExpandedRowDetail.tsx` — awaiting_payment shows "Confirm payment received" (admin) + embeds dialog; assign popover / self-assign hidden in that stage; Reject allowed in awaiting too.
- `approvals.tsx` — **fixed latent trap:** Hero + tabs now always render; empty state moved into the list region and is tab-aware (empty Awaiting tab no longer hides the tab bar). Removed now-unused `EmptyState` import.

**Verify:** `bun check-types` green (all 3 packages); `bun check` 0/0 on touched files.

**Delivers Journey 1 (manual confirm → moves to Pending) and Journey 3 (installment first payment) end-to-end at the backend+UI level.** Note: Branch A (installment delegation) was implemented now rather than stubbed to Phase 2.

### Remaining
- **Phase 2 (UI method-awareness):** Stripe-pending rows → read-only "Processing" badge (no confirm button); `failed` → "Resend link" (stripe only) + Reject. Backend already blocks stripe confirm.
- **Phase 3 (HIGH-RISK, expert's top trap):** retime "ready-to-assign" notification to the assignable transition at all 3 sites (`confirmPayment` ✅ done, POS inline, Stripe webhook) + stop unconditional create-time trainer ping + admin "purchase received" at create; refund/failed badge on Approved rows; hero KPI split.
- **Phase 4:** confirmPayment unit tests (guard matrix; DB-mutation branches via integration/browser — fragile to unit-mock given `confirmInstallmentPayment` + permission service); browser verify Journeys 1/3/4/5.

**Checkpoint reason:** Phase 1 is a clean shippable slice. Phase 3's notification retiming spans POS + Workers webhook + create + notification.service — cross-cutting and the riskiest part — so pausing for user direction / browser verification before that.

## 2026-05-31 (cont.) — "Proceed" → Phases 2–4 implemented

### Phase 2 — method-aware awaiting actions (DONE)
- `ExpandedRowDetail.tsx` awaiting-payment action is now method-aware:
  - `paymentStatus=failed` → read-only "Payment failed — resolve or reject" (Reject only; no fake mark-paid).
  - `paymentMethod=stripe` → read-only animated "Processing online payment…" badge (no confirm button; auto-confirms via webhook).
  - offline (cash/manual_transfer/card/fpx) → admin "Confirm payment received".
- Backend already blocks stripe confirm (Phase 1). No package-level resend-link procedure exists (`sendPaymentLink` is appointments-only) → resend deferred as follow-up; failed rows get Reject.

### Phase 3 — notification retiming + refund badge + KPI label (DONE; SIMPLER than planned)
- **Key finding:** in this codebase only `packageInstances.create` lands a package in `status=pending`. POS sets `active` directly; the Stripe webhook sets `active` (Q6). Neither feeds the assignment queue or notifies. So the "3-site" retiming reduced to ONE gate:
  - `create.procedures.ts` — the create-time "ready to assign" trainer ping now fires only when `status=pending` AND payment received (`paid`/`partially_paid`). Deferred/unpaid packages notify later from `confirmPayment` (already wired). No POS/webhook edits needed for the assignment queue.
  - Admin "purchase received" notification deferred (would need a new notification type) — noted, low priority.
- `InboxRow.tsx` — refund/failed badge ("Refunded" / "Payment failed") on the collapsed row; surfaces the Stripe-dashboard `active+refunded` case on the Approved tab.
- `HeroStats.tsx` — tab-aware hero label (Awaiting payment / Pending package approvals / Approved / Rejected) via new `approvalStatus` prop; passed from `approvals.tsx`. (Full cross-tab KPI split skipped — needs extra queries; per-tab hero already reflects the active tab.)

### Phase 4 — tests (DONE; browser pending)
- `package-instances.router.test.ts` — added `confirmPayment` guard-matrix describe (NOT_FOUND, not-purchased BAD_REQUEST, idempotent alreadyConfirmed, cancelled BAD_REQUEST, stripe BAD_REQUEST). **10/10 pass.** (Admin ctx passes `requirePermissionOrpc` via the `role==="admin"` fallback — no permission-service mock needed.) Mutation branches (mark-paid / installment delegation) left to browser/integration — not worth brittle unit mocks of `confirmInstallmentPayment` + row locks.
- Q6 webhook approval-bypass filed as a spawned follow-up task (out of scope here).

**Verify (final):** `bun check-types` green (all 3 packages); `bun check` 0/0 on all touched files; server unit tests 10/10.

### Browser verification (Phase 4 Task 4.3) — DONE via Chrome MCP, 2026-05-31
Live at http://avantej.localhost:3021/dashboard/operations/approvals (tenant: Test Fitness Franchise, authenticated):
- **Awaiting payment tab renders + queries** — showed **24** previously-hidden unpaid packages (independent payment gate working). ✅
- **Tab-aware hero label** — "PACKAGES AWAITING PAYMENT" on the new tab; "PENDING PACKAGE APPROVALS" on pending. ✅
- **Empty-tab trap fix** — tab bar stays visible when the Pending tab is empty (0 rows). ✅
- **Method-aware action** — `manual_transfer/pending` row → "Confirm payment received" + Reject; assign popover hidden. ✅
- **ConfirmPaymentDialog** opens with the recorded method defaulted (Manual transfer), notes field. ✅
- **confirmPayment works** — confirmed a `status=pending` purchased package (Bryan Voo, RM 162) → toast "Payment confirmed — package is ready for trainer assignment"; it **left Awaiting (24→23)** and **appeared in the Pending assignment tab (0→1)** with the sidebar Approvals badge → 1. Full Journey 1 transition verified end-to-end. ✅
- **By-design observation:** confirming a `status=active` seed package (customer "Testing", approval-gate-off style) marked it paid and removed it from Awaiting but it did NOT enter Pending — correct, since `confirmPayment` never mutates `status` and Pending = `status=pending`. (Active-unpaid → active-paid.)

Not exercised live (no such data in tenant): Stripe "Processing" read-only badge and `failed` Resend/Reject states — covered by code/logic + the backend stripe-block unit test.

### Pre-existing (not this feature)
- The 4 failing `approvals.test.tsx` Vitest tests from the incomplete orpc-mock migration remain (documented earlier). Unrelated to this work.

## 2026-05-31 (cont.) — Scaling refinement: ledger sync in confirmPayment Branch B

**Decision:** source-of-truth = the `payments` ledger; `packageInstances.paymentStatus` is a derived projection. Don't dual-write independent statuses; don't fabricate ledger rows.

**Money-trail trace (verified):**
- `payments` table = money ledger; POS + walk-in insert into it for every sale (cash uses a synthesized `pos_<uuid>` for the `notNull().unique()` `stripePaymentIntentId`). Required notNull cols: stripePaymentIntentId, customerId, amount, totalAmount, franchiserAmount, status.
- `packageInstances.paymentStatus` is derived (`syncPackagePaymentStatus` from installmentsPaid/Total).
- `salesOrders.status` = order lifecycle only (no paymentStatus column).
- `packageInstances.create` sets `paymentId` nullable (admin packages are usually OFF-ledger); online purchase has no payments row until the webhook; POS sales are already `succeeded` (so not in Awaiting). → manual-confirm packages are typically off-ledger, so the practical divergence is small.

**Change (confirm-payment.procedures.ts, Branch B):**
- Within the confirm transaction, if `pkg.paymentId` is set, flip the linked `payments` row `status → "succeeded"` (+ paymentMethod, updatedAt), guarded by `ne(status, "succeeded")`. Keeps Sales & Payments consistent when a ledger row exists.
- Deliberately does NOT fabricate a new payments row (would inject financially-incomplete records missing franchiser-split / platform-fee / e-invoice). Off-ledger admin packages legitimately have no sale → package paymentStatus is their only truth.
- Added `ledgerPaymentId` to the audit `changes`.
- Branch A (installments) unchanged — delegates to the canonical installment service (the ledger path for plans).

**Verify:** `bun check-types` green; `bun check` 0/0; server tests 10/10.

**Deferred (v2, scaling):** extract a shared `recordPackagePayment()` used by POS + installments + webhook + approvals so there's literally one writer; optionally derive a `salesOrders` settled flag.

## STATUS: feature complete + browser-verified + ledger-sync refinement. Q6 webhook fix filed as follow-up.
