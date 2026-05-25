# Audit-Prove Report (AUDIT-ONLY) — 2026-05-25

**Session:** `zplan/2026-05-25-0023-audit-prove`
**Scope:** 8 domains · ~30 Main-nav pages · 50 captured findings (35 testable)
**Mode:** `--audit-only` (map & gap only — NO code edits, NO remediation loop, NO proof video, NO branch)
**Build gate:** 🟡 **CI-green but masking latent runtime crashes** (see correction below)
**Pre-audit:** committed in-progress POS/rate-limit work on `main` as `e3881362`.

> **CORRECTION (post-verification + fix):** The earlier "build is RED" headline was wrong. The CI gate (`bun check-types` → `turbo check-types`) runs `tsc` only for `apps/web` (✅), `apps/server` (✅) and `apps/native` (❌ 1 pre-existing unrelated error). `packages/api` has **no** check-types script and the apps consume its prebuilt `dist/*.d.ts`, so its ~35 source errors were **masked** — CI was effectively green. BUT the `TS2304` "cannot find name" errors were **guaranteed runtime crashes** (handlers referencing unbound symbols). Those have now been **FIXED** (commit pending review) — see "Fixes applied". Remaining latent: `routers/index.ts` `TS7056` (client-type-inference degradation, not runtime) and a `guards.test.ts` test-typing issue.

Per-domain detail: `audit/01-*.md` … `audit/08-*.md`. Machine-readable: `audit/findings.json`. Domain map: `audit/domains.json`.
Legend: ✅ verified (conductor read/tsc-confirmed) · 📋 agent-reported · ⚠️ corrected.

---

## 0. Headline — latent runtime crashes in packages/api (now fixed)

`packages/api` emits **83 tsc diagnostics** under `tsc -b packages/api`; stripping the noise (42× `TS6133`/`TS6196` unused-import from the Plan D-S7 router splits, 10× `TS2307` `bun:test` in test files) left **~35 real errors** — of which ~12 `TS2304`/`TS2345`/`TS2339` clusters were guaranteed **runtime crashes** in live handlers (Approvals assign/pending, appointment update, GCal settings, household/membership permission checks). The CI gate did **not** catch these (api isn't type-checked directly; apps use prebuilt `.d.ts`). **All runtime-crash clusters are now fixed** (see below); the `TS6133` unused-import noise and the `index.ts` `TS7056` remain as non-runtime cleanup.

### Fixes applied (2026-05-25, commit pending review on `main`)
| Fix | Files |
|---|---|
| `getAppointmentById` added to services import | `appointments/crud.procedures.ts` |
| `user` table import + `inArray` + `bulkAssign` `trainerMember`→`input.trainerMemberId` | `package-instances/assign.procedures.ts` |
| `user as cpUsers` alias → `user` | `package-instances/pending.procedures.ts` |
| `requirePermissionOrpc` added to guards import | `package-instances/history.procedures.ts` |
| **Restored 4 scrambled procedures** to match frontend contract: real `listForMember` (list) + `assign` (insert) + `updateBuffer` (buffer upsert) + real `remove` (delete) | `service-members.ts` |
| `ControlPanelDb` type import added | `hierarchy/members.procedures.ts`, `hierarchy/move.procedures.ts` |
| `checkPermission` param typed `Context` (lets null-guard narrow to `TenantDb`/`Member`) | `households.ts`, `memberships.ts` |
| removed erroneous `assertOrgContextMatch(context, input)` (schema had no `organizationId`; always threw FORBIDDEN) + orphaned import | `google-calendar.ts` |

Verification: CI gate unchanged (`web` 0, `server` 0, `native` 1 pre-existing); affected router unit tests pass (package-instances, appointments, services, members, pos, tenant-procedure = 48 tests green).

**Verified compile-breaking locations:** ✅
| File:line | Error | Breaks |
|---|---|---|
| `appointments/crud.procedures.ts:177` | `getAppointmentById` unbound (TS2304) | appointment update/cancel/reassign |
| `package-instances/assign.procedures.ts:183-316` | `user`, `inArray`, `trainerMember` unbound (TS2304 ×12) | **Approvals** "assign = approve" |
| `package-instances/pending.procedures.ts:104-163` | `user` unbound (TS2304 ×9) | Approvals pending queue |
| `package-instances/history.procedures.ts:26` | `requirePermissionOrpc` unbound | package history |
| `service-members.ts:180,238,255,261` | `serviceId`/`bufferTimeMinutes` off wrong input (TS2339 ×4) | service↔member assign/buffer |
| `hierarchy/members.procedures.ts:207`, `move.procedures.ts:146` | `ControlPanelDb` unbound (TS2304) | hierarchy member list/move |
| `households.ts:45`, `memberships.ts:48` | `{}` not assignable to `TenantDb` (TS2345) | households / memberships |
| `routers/index.ts:12` | root-router inferred type too large (TS7056) | **end-to-end client type-safety** |
| `google-calendar.ts:151` | call missing `organizationId` (TS2345) | GCal connect |

> `packages/services` is otherwise clean (its only tsc errors are `bun:test` in `*.test.ts`, a config artifact — `bun test` runs fine).

### ⚠️ Corrected false finding
The POS agent's headline P1 — "undefined `itemNet` at `pos.service.ts:622/652`, services fails tsc" — is **false**. `itemNet` is declared at `pos.service.ts:602` (`const itemNet = itemGross - itemDiscount`). Confirmed by direct `tsc -b packages/services`. Dropped from the worklist.

---

## 1. Top cross-cutting themes (P1 — money / data integrity / RBAC)

These recur across domains and are the highest-value fixes after the build:

1. **Stock never moves on the money path.** POS sales don't decrement `product_stock`; refunds don't restock; legacy `purchaseOrders.receiveItems` marks received without moving stock; there is **no `stock_movements` ledger anywhere**. (`F-POS-02`, `F-FIN-03`, `F-INV-01/02`)
2. **Commission money leak.** `approveRefund` writes `commission_split_reversals` but never flips the split status, and the only settler `processCommissionReversals` has **no production caller** (tests only) — so `runBatch` pays out refunded commission. (`F-FIN-01` ✅)
3. **Notifications are write-only.** Every `notify*` helper only INSERTs a `notifications` row; no email/SMS/push dispatch exists, yet a 7-channel preference UI claims otherwise. (`F-HOME-01/02`)
4. **RBAC scope leaks.** `hierarchy.listAllMembers` returns all org members unfiltered by `accessibleNodeIds` (✅); `members.retryGhlSync` has no permission gate; `households.addMember/create`, `transfer-orders.list` skip scope checks. (`F-STAFF-01/02`, `F-CUST-02`, `F-INV-04`)
5. **Sale lifecycle dead-ends for non-Stripe tenants.** Cash/card/transfer sales stuck at `confirmed`; only the Stripe webhook sets `completed`, so receipts/KPIs under-report. (`F-POS-01`)
6. **Two unreconciled freeze systems.** Membership freeze writes `status='paused'` (not in the package-instances enum); the lifecycle path uses `'frozen'`; the UI filter keys off `is_locked` which nothing sets. (`F-PKG-01`)

## 2. Findings by domain (counts)

| Domain | File | Testable | Headline |
|---|---|---|---|
| Home, Reports & Comms | `audit/01-*.md` | 6 | notifications/prefs write-only; activity log has no writer |
| POS, Sales & Installments | `audit/02-*.md` | 7 | no stock decrement; non-Stripe sales never complete; price trust |
| Finance (Refunds/Payouts/Commissions/Tax/Expenses) | `audit/03-*.md` | 8 | commission money leak; expense no ledger; no refund restock |
| Scheduling (Appts/Slots/Availability/Attendance) | `audit/04-*.md` | 7 | slot-cancel doesn't refund enrollees; waitlist promote no booking; GCal token not decrypted |
| Services, Packages, Memberships & Approvals | `audit/05-*.md` | 7 | 4× P0 compile breaks; paused≠frozen; auto-resume cron unwired |
| Customers | `audit/06-*.md` | 8 | household scope leak; credit/household write-only; walk-in legacy |
| Inventory & Products | `audit/07-*.md` | 9 | stock side-effects missing; UoM conversion unused; promo applicability ignored |
| Staff, Access, Branches & Onboarding | `audit/08-*.md` | 12 | listAllMembers scope leak; retryGhlSync ungated; markExpiredInvitations unwired |

## 3. Doc drift (P3)
`zhub/shared/api-overview.md` is stale across every domain: undocumented routers (`scheduledReports`, `userActivityLog`, `trainers`, `branchInvites`, `households`, `member-profiles`, `coach-intake`), most `google-calendar`/`trainer-availability`/`waitlist` procedures, `installments` (12 procs vs 3 documented), and several renamed procedures. Worth a `/hub-update` pass.

## 4. Verification notes
Conductor independently confirmed (read or `tsc`): all 9 build-break clusters (✅), the commission-reversal orphan (grep — tests only), `markExpiredInvitations` unwired (grep — no prod caller), `hierarchy.listAllMembers` shape, and **corrected** the false `itemNet` P1 and the over-stated walk-in "dead CRUD" (route is an intentional LEGACY redirect to `customers/v2/view`). Remaining P1/P2 feature findings are 📋 agent-reported from disjoint read-only file ownership and are reliable but not each line-verified.

## 5. Recommended next step
This was audit-only by request. To act on it:
- **Fastest win:** clear the RED build first (the 9 clusters above) — mostly missing imports/type annotations from the recent router-split refactor, plus one explicit type on `routers/index.ts`.
- Then, to auto-fix + prove: re-run `/audit-prove` **without `--audit-only`** (defaults: `--scope full`, 6 iterations, branch `audit-prove/remediation-<ts>`). It reuses these findings and won't re-run the fan-out.
- Or scope a single page: `/audit-prove --page /dashboard/operations/approvals` (etc.) for a focused white-box fix loop.
