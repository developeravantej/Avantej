# Audit-Prove -a · Phase 1 Report

**Session:** `zplan/2026-05-27-0143-audit-prove-a/`
**Branch:** `audit-prove/remediation-services-tabs-20260525-1529`
**Generated:** 2026-05-27
**Mode:** human-gated (`audit-prove-a`)
**Prior session:** `zplan/2026-05-26-2323-audit-prove` (21/21 fixed) + `zplan/2026-05-27-0127-audit-prove-incr` (5 more fixed)

---

## Scope

Read-only audit of **unaudited subsurfaces** + **files changed since `98f896af`**.

| Domain | Files inspected | Findings | Top issue |
|---|---|---|---|
| `inventory-warehouse` | 9 routers, 8 services | 10 (P1: 5, P2: 4, P3: 1) | `completeTransfer` TOCTOU + unbounded `quantityReceived` |
| `access-control-rbac` | 10 routers, 6 services | 10 (P1: 4, P2: 4, P3: 2) | `role-permissions.add` self-escalation via `user_management:update` |
| `notifications-audit-platform` | 6 routers, 9 services + cron | 9 (P1: 2, P2: 5, P3: 2) | `analytics.service.ts` raw SQL bypasses `accessibleNodeIds` |
| `commissions-payouts-refunds-changed` | 7 routers, 7 services, 4 frontend | 12 (P1: 5, P2: 5, P3: 2) | **Double-negate clawback turns refunds into bonus payouts (theft vector)** |
| **External findings.json (preserved)** | (cross-domain) | 26 (crit: 4, high: 9, med: 9, low: 4) | `commission_payout:process` permission **never seeded** → entire payout flow returns FORBIDDEN |

**Total: 57 findings across 5 domains** (19 P1, 23 P2, 11 P3, 4 low/cosmetic).

---

## Verified claims (orchestrator re-read)

- **CPR-01** verified: `commission-splits.service.ts:1928` writes `amountCents = -unreversed` (negative). `payouts.service.ts:73` then computes `totalNegativeAmountCents = -reversals.reduce(sum + amountCents, 0)` — double-negation → positive payout. Confirmed real exploit path.
- **IW-03** verified: `transfer-orders.service.ts:158-206` reads transfer outside tx (no row lock), no status precondition in final UPDATE, `quantityReceived` is unbounded caller input. Replay double-deducts.
- **AC-A-04** verified: `orpc-tenant.middleware.ts:192-194` — `tenantDb.query.members.findFirst({ where: eq(members.userId, user.id) })` — no `isNull(deletedAt)` / `status='active'` / `isActive=true` filter. Deactivated members keep full permissions.

External-file findings (`CP-001`, `CP-002`, `SI-008`, `SI-009`, `DU-001`, etc.) carry their own `verifiedBy: self` / `verifiedBy: agent` tags from the original author; orchestrator did not re-verify these.

---

## Top P1 issues — recommended remediation order

| # | ID | Domain | Title | File |
|---|---|---|---|---|
| 1 | **SI-008** | server-infra | `BETTER_AUTH_SECRET` falls back to hardcoded `dev-secret-key-minimum-32-characters-long` — sessions forgeable in misconfigured deploys | `apps/server/src/lib/better-auth.ts:323` |
| 2 | **SI-009** | server-infra | CORS allowlist hardcodes localhost origins at module level — always active in production | `apps/server/src/index.ts:56` |
| 3 | **CP-001** | commissions-payouts | `commission_payout:process` never seeded → `runBatch` and `processForRecipient` always FORBIDDEN for ALL users incl. admins | `packages/api/src/routers/payouts.ts:187` |
| 4 | **CP-002** | commissions-payouts | `commission_review:resolve` never seeded → Review tab approve/reject always fails | `packages/api/src/routers/commission-splits/review.procedures.ts:69` |
| 5 | **CPR-01** | commissions | `processCommissionReversals` double-negates — refunded commission becomes positive payout (theft vector) | `packages/services/src/payouts.service.ts:73` |
| 6 | **CPR-02** | commissions | Partial reversals flip entire split to status='reversed' — drops unreversed remainder | `packages/services/src/payouts.service.ts:106` |
| 7 | **CPR-05** | refunds | Full package-instance refund doesn't cancel package or freeze credits — refunded customers keep consuming | `packages/services/src/refunds.service.ts` |
| 8 | **AC-A-01** | access-control | `role-permissions.add` allows self-escalation via `user_management:update` | `packages/api/src/routers/role-permissions.ts` |
| 9 | **AC-A-04** | access-control | Deactivated members keep permissions until session cookie expires (middleware never filters) | `apps/server/src/middleware/orpc-tenant.middleware.ts:192` |
| 10 | **IW-03** | inventory | `completeTransfer` TOCTOU + unbounded `quantityReceived` — replay double-deducts, caller can mint stock | `packages/services/src/transfer-orders.service.ts:158` |
| 11 | **IW-04** | inventory | `fulfillStockRequest` replay-vulnerable — same pattern as IW-03 | `packages/services/src/stock-requests.service.ts:156` |
| 12 | **IW-05** | inventory | `createReceipt` no PO status / item-PO scope / over-receipt guards | `packages/services/src/goods-receipt.service.ts:76` |
| 13 | **DU-001** | dashboard-ui | Payment view crashes on load — `item.date.toISOString()` on a string | `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx:41` |
| 14 | **NAP-03** | analytics | `analytics.service.ts` raw SQL bypasses `accessibleNodeIds` — branch staff reads org-wide metrics | `packages/services/src/analytics.service.ts` |
| 15 | **NAP-04** | scheduled-reports | Cron hard-codes `accessibleNodeIds = all-tenant-nodes`; no recipient allowlist | `apps/server/src/services/scheduled-reports.service.ts` |
| 16 | **CU-002/003/004** | customers | customer-profiles RBAC scope gap — staff in branch A can send magic-link/claim-link for branch B customers (3 procedures) | `apps/server/src/routers/customer-profiles.ts:463, 570, 774` |
| 17 | **IW-01** | inventory | `transfer-orders.create` skips branch RBAC — staff at A can author transfer draining branch B → C | `packages/api/src/routers/transfer-orders.ts:64` |
| 18 | **AC-A-02** | access-control | `roles.create/update/delete` gates on `user_management:*` not declared `role_management:*` | `packages/api/src/routers/roles.ts` |
| 19 | **AC-A-03** | access-control | `branch-invites.revoke/regenerate` skip `guardBranchAccessible` | `packages/api/src/routers/branch-invites.ts` |
| 20 | **CPR-03** | expenses | `approveExpense` has no submitter≠approver check — self-approval possible | `packages/api/src/routers/expenses.ts` |

(Full list — including P2 / P3 — in `findings.json` + the four domain `.md` reports + `findings.external.json`.)

---

## Source files

- `audit/inventory-warehouse.md` — 10 findings, ~250 LOC
- `audit/access-control-rbac.md` — 10 findings, ~250 LOC
- `audit/notifications-audit-platform.md` — 9 findings, ~205 LOC
- `audit/commissions-payouts-refunds-changed.md` — 12 findings, ~268 LOC
- `audit/findings.external.json` — 26 cross-domain findings (preserved from prior audit pass)
- `audit/findings.json` — consolidated index with severity totals + priority order
- `audit/domains.json` — domain map for this session

---

## Next steps (per `audit-prove-a` Phase 4)

Phase 2 (test plan) and Phase 3 (Playwright harness) are read-only and can run automatically. However, **with 57 findings, a full proof spec would be unwieldy** — most findings are server-side correctness bugs that don't have a clean UI assertion.

**Recommendation for human review:**
1. **Confirm or revise priority order** for the top 20 P1s above
2. **Decide which findings actually need a proof spec** vs. which are best verified by integration tests / direct DB inspection (many already have integration tests added in recent commits — `refund-state-machine`, `commission-approve-invariants`, etc.)
3. **Set a remediation batch size** — the project.json says `maxIterations: 5, parallelFixAgents: 4`. At 4 fixes per iteration, that's ~20 fixes per 5 iterations. To fix all 19 P1s you'd need to extend iterations or trim scope.

The next prompt to you will surface this priority list and ask which items to take into Phase 4 (remediation).
