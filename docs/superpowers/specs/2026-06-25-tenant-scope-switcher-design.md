# Tenant Dashboard Scope Switcher — Design Spec

- **Date:** 2026-06-25
- **Status:** Approved (design); pending spec review
- **Surface:** Tenant dashboard (`apps/web`, `/dashboard/*`) — **not** the control-panel / platform-admin surface
- **Branch:** `fix/tenant-multi-country-region-support`

## 1. Problem

Client question:

> "This account is only for 1 country only right? Doesn't seem like there's a way to cycle across different region/country/state."

The multi-country **structure** already exists and works: a tenant org has a tree of `organization → country → state → branch` hierarchy nodes (verified live — Test Fitness Franchise has Malaysia / Singapore / Thailand / USA), branch CRUD syncs to GoHighLevel, and RBAC scopes data by `accessibleNodeIds`.

What is missing is the **navigation layer**: there is no UI control to pick a country / state / branch and have the dashboard load that scope's data. The closest existing affordance is the sidebar org button (`app-sidebar.tsx`), which renders a chevron implying it is switchable but has **no `onClick` and no menu** — a dead control that actively reinforces the client's "no way to cycle" impression.

Today the active scope is **fixed at login**: every scoped query keys off the member's `hierarchyScopeId` / `accessibleNodeIds` from `useUserContext`, and there is no runtime way to change it.

## 2. Goal / Non-goals

**Goal:** A global scope switcher in the tenant dashboard that lets a user pick any hierarchy node within their access (country / state / branch, plus a scoped "All") and re-scopes **read/analytics** surfaces to that node. Safe by construction — the switcher can only ever *narrow* within the user's server-derived access.

**Non-goals:**
- Auto-scoping **write/operational** flows (POS sale, create member). These keep an explicit per-operation branch picker (seeded from the active scope but independently confirmed) to prevent mis-scoped sales / commissions.
- Cross-currency FX conversion (no single converted grand total). Out of scope; see §7.
- Consolidating the scattered per-page branch filters into the global switcher (future cleanup).
- Any control-panel / platform-admin change.

## 3. Locked Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Re-scope breadth | **Option 3** — reads follow the switcher; writes stay explicit |
| 2 | Switchable levels | All levels (country / state / branch) + a scoped "All"; each pickable only if ∈ `accessibleNodeIds` |
| 3 | Persistence | `activeScopeId` in localStorage, namespaced per `(user, org)`; **validated against `accessibleNodeIds` on load**, falls back to `hierarchyScopeId` if stale/deleted |
| 4 | Switcher visibility | Options strictly = `accessibleNodeIds`; 1 accessible node → static label (no dropdown); server enforces on every scoped read |
| 5 | "All" semantics | = the caller's **top accessible node**, never higher (owner → org root; regional mgr → their region; branch staff → their branch) |
| 6 | Multi-currency "All" money | **Layout C** — per-country cards (each its own currency) when scope = "All"; normal KPI tiles for a single-node scope. No cross-currency grand total. |

## 4. Architecture

### 4.1 Two-axis authorization model (already in the codebase)

Role and scope are orthogonal and *stack*:

```
ROLE / permission  → WHAT you can do   (reports:read, hierarchy_management:read, …)
SCOPE (node)       → WHERE you can do it (which branches' rows)
```

```
member.hierarchyScopeId              ← assigned node (independent of role)
        │ getDescendantNodeIds()
        ▼
member.accessibleNodeIds             ← that node + all descendants
        │
        ▼
switcher options = accessibleNodeIds
```

A query is served only if **both** hold: permission ✓ **and** `scopeId ∈ accessibleNodeIds` ✓. Role cannot widen scope; scope cannot grant actions. System admins bypass scope (empty `accessibleNodeIds` = org-wide, per `guards.test.ts:142`).

### 4.2 Active-scope context

Introduce a user-selectable **`activeScopeId`** that replaces the *fixed* `hierarchyScopeId` as the value read pages pass to queries.

- Implemented as a small `ScopeProvider` (or a focused extension of `useUserContext`) exposing `{ activeScopeId, setActiveScope, activeScopeNode, accessibleNodeIds }`.
- **Default** = member's `hierarchyScopeId` (owner → org root → "All").
- **Persisted** in `localStorage` under a key namespaced by `(userId, organizationId)`.
- **Validated on load:** if the persisted id is not in `accessibleNodeIds` (access revoked) or the node no longer exists (deleted), discard and fall back to `hierarchyScopeId`. Never trust localStorage blindly.
- Resets when the org changes.

This is the one genuinely cross-cutting change: the god-node `useUserContext` is consumed widely, so the new context is introduced alongside it and adopted page-by-page (see phasing).

### 4.3 Switcher UI

- Wire the dead sidebar org button (`apps/web/src/components/app-sidebar.tsx`) into a real control.
- On click: a searchable tree/dropdown of `accessibleNodeIds`, grouped `country → state → branch`, plus a top **"All (org-wide)"** entry that resolves to the caller's top accessible node.
- The sidebar sub-line ("29 branches") is replaced by the active scope label ("Viewing: All countries" / "Viewing: Singapore").
- Each page header shows a small scope chip echoing the active scope.
- If the user has exactly 1 accessible node → render a static label, no dropdown.

### 4.4 Read pages consume `activeScopeId`

Data hooks on read surfaces read `activeScopeId` instead of the fixed `hierarchyScopeId`.

- **Phase 1:** Overview + Reports.
- **Phase 2:** Members list, Appointments list, Commissions view.

### 4.5 Write flows untouched

POS sale and create-member keep their explicit per-operation branch `<Select>`, seeded from `activeScopeId` but independently confirmed. No write path is auto-driven by the switcher.

### 4.6 "All" view & multi-currency money (Layout C)

- "All" = the caller's top accessible node; backend already aggregates via `getDescendantNodeIds(scopeId)` (verified — selecting the org root on the Branch Overview shows org-wide totals).
- Counts (members, staff, appointments) aggregate into the top KPI tiles normally.
- **Revenue must never be summed across currencies.** When scope = "All" and the subtree spans multiple country currencies, render a **per-country card grid** (each card in its own currency) instead of a single revenue tile. For a single-node scope (one currency), keep the normal KPI tiles.

## 5. Security Model — Validated, Never Trusted

> This is the binding constraint. The switcher must not become a privilege-escalation path. Tenant/scope isolation is a never-break rule.

**Rules:**
1. The switcher can only ever **narrow** within the member's server-derived `accessibleNodeIds`. It never replaces or expands it.
2. **UI filtering is convenience only.** The security control is server-side: every scoped read must enforce that the incoming scope/branch id is within `accessibleNodeIds`, via `guardInputBranchForContext` (for input ids) or `guardStoredBranchForContext` (for branch ids on loaded records), per `packages/api/src/guards.ts`.
3. A forged request (a branch manager hand-crafting an API call with a regional `scopeId`) must return `FORBIDDEN` / `NOT_FOUND`.

### 5.1 Audit finding (blocking)

A workflow audit (`scope-guard-coverage-audit`, run `wf_f91ce6eb-0e0`, output at `…/tasks/wjatcb8yh.output`) checked all tenant scoped-read procedures. Result: **94 audited, 17 confirmed cross-branch leak-risks across 12 of 16 router groups.**

These leak **today** but are bounded ("attacker must already know a target UUID"), because `scopeId` is fixed server-side and cannot be supplied by the caller. **A user-controlled switcher removes that bound** — a selectable scope id becomes an authorization input. Therefore guarding these is a **hard prerequisite (Phase 0)**; the switcher must not be enabled until they merge.

Two root-cause patterns:
1. **By-id reads with no branch predicate** (`findFirst({where: eq(id,…)})`) — ~12 of 17.
2. **`trusts-fixed-scope`** procedures (cancelled-sales list/export, refund decisions, payout markers) whose model assumes scope cannot change — broken by design once scope is selectable.

Reference (already-correct) patterns to copy: `commissionSplits.liabilityByStaff`, `appointments.getById` (`guardStoredBranchForContext`), `members.getById`, `listInvoices` (accessibleNodeIds JOIN), `pos.*`, `analytics.*`.

### 5.2 Phase 0 must-fix checklist (17 confirmed)

**High severity**
- `salesOrders.getById` — `sales-orders/query.procedures.ts:127-159` → `guardStoredBranchForContext(context, order.branchId)` after load.
- `payouts.previewBatch` (+ `runBatch`, `processForRecipient`) — `payouts/batch.procedures.ts:30-189` → validate each `staffId`'s `hierarchyScopeId ∈ accessibleNodeIds`; `branchId` guard is currently dead.
- `commissionSplits.liabilitySummary` — `commission-splits/analytics.procedures.ts:85` → guard `hierarchyNodeId` + thread `accessibleNodeIds` into service; derive accessible-descendant scope when omitted.
- `commissionSplits.exportLiabilityCsv` — `commission-splits/analytics.procedures.ts:175-242` → same fix as liabilitySummary (shared service path).
- `packageInstances.getById` (staff path) — `package-instances/client.procedures.ts:80` → resolve `service.branchId`, `guardStoredBranchForContext`.
- `packageInstances.downloadPaymentProof` (+ `listPaymentProofs`, `getAgreement`) — `package-instances/payment-proof.procedures.ts:158-207` → resolve `pkg → service.branchId`, `guardBranchAccessible` before streaming; return `NOT_FOUND` to avoid enumeration oracle.

**Medium severity**
- `members.newToday` — `members/read.procedures.ts:122-144` → `guardInputBranchForContext(context, input.branchId)`; `branchId` currently *replaces* `accessibleNodeIds` in `member-stats.service.ts:65`.
- `appointments.statusHistory` — `appointments/list-detail.procedures.ts:124-190` → load appointment, `guardStoredBranchForContext(context, appointment.branchId)`.
- `salesOrders.statusHistory` — `sales-orders/query.procedures.ts:161-227` → load order, guard `order.branchId`.
- `invoices.getById` — `invoices.ts:96-103` → guard linked `salesOrders.branchId` (or thread `accessibleNodeIds` JOIN like `listInvoices`).
- `invoices.getDetail` — `invoices.ts:127-142` → same JOIN/guard.
- `invoices.paymentStatusHistory` — `invoices.ts:244-262` → same.
- `refunds.getById` — `refunds/read.procedures.ts:92-107` → `guardStoredBranchForContext(context, refund.branchId)`.
- `categoryCommission.getByCategory` (+ `upsert`, `deleteConfig`) — `category-commission.ts:19-167` → resolve category `branchId`, `guardStoredBranchForContext`.
- `packageInstances.listAll` — `package-instances/lists.procedures.ts:111-168` → route through service joining owner `hierarchy_scope_id ∈ accessibleNodeIds` (mirror `listMemberships`).
- `packageInstances.statusHistory` — `package-instances/history.procedures.ts:11-74` → load instance → service, guard branch.
- `packageInstances.listPaymentProofs` — `package-instances/payment-proof.procedures.ts:161-207` → resolve `svc.branchId`, `guardBranchAccessible`.

**Additionally review (matrix-flagged `trusts-fixed-scope`, not in the 17 but invalidated by a selectable scope):** `cancelledSales.list` / `getById` / `exportCsv`; `households.get` / `addMember` / `removeMember`; `commissionCycle.upsert` / `delete`. Re-audit and convert to explicit `accessibleNodeIds` enforcement.

### 5.3 Phase 0 structural safeguards
- **Regression tests:** for each fixed procedure, an out-of-scope id → `FORBIDDEN` / `NOT_FOUND`.
- **Optional CI gate:** flag by-id `findFirst` reads on branch-scoped tables that lack a branch guard (12 of 17 leaks share this shape).

## 6. Edge Cases

| Case | Handling |
|------|----------|
| Persisted scope after access revoked | Validate `activeScopeId ∈ accessibleNodeIds` on load; else fall back to `hierarchyScopeId`. |
| Scope node deleted | Validate node exists; fall back. |
| Forged out-of-scope `scopeId` | Server guard rejects (`FORBIDDEN`) — §5. |
| Org switch | Scope key namespaced per `orgId`; reset on org change. |
| Single accessible node | No dropdown; static label. |
| Write flow scope | Per-op branch picker bounded to `accessibleNodeIds` (`guardInputBranchForContext`). |
| "All" across currencies | Per-country cards; no summed total (§4.6). |

## 7. Out of Scope / Future
- **FX-converted grand total** (the rejected "Layout B"): needs an `fx_rates` table + refresh job; revenue total would be approximate/stale. Defer until a real requirement.
- **Consolidating per-page branch filters** into the global switcher.
- **Auto-scoping write flows** (explicitly excluded for correctness).

## 8. Phasing

```
Phase 0  SECURITY PREREQUISITE (blocks switcher; ships independently)
         • guard the 17 confirmed leaky reads (§5.2) + review the trusts-fixed-scope set
         • regression tests: out-of-scope id → FORBIDDEN/NOT_FOUND
         • (optional) CI gate for unguarded by-id branch reads

Phase 1  SCOPE SWITCHER v1
         • ScopeProvider (activeScopeId, persistence, validation)
         • switcher UI (wire dead org button → accessibleNodeIds tree + "All")
         • Overview + Reports consume activeScopeId
         • "All" per-country money cards (Layout C)

Phase 2  EXPAND READ COVERAGE
         • Members list, Appointments list, Commissions view consume activeScopeId
```

The switcher must not be enabled (even behind a flag, in a way that reaches queries) until Phase 0 merges green.

## 9. Testing
- **Phase 0:** unit/integration regression tests per fixed procedure (out-of-scope id → `FORBIDDEN`/`NOT_FOUND`); confirm admin (empty `accessibleNodeIds`) bypass preserved.
- **Phase 1/2:** ScopeProvider unit tests (default, persistence, stale-fallback, org-switch reset); Chrome-MCP journey — owner switches MY → SG → All and verifies Overview/Reports re-scope; branch-manager login sees only their node (no dropdown) and a forged regional `scopeId` is rejected.

## 10. Open Risks
- Phase 0 is sizeable (17+ procedures across many routers). It is independently valuable (closes existing intra-tenant leaks) and can ship before any switcher work.
- `useUserContext` is a god-node; introducing `ScopeProvider` beside it (not replacing) keeps the blast radius incremental.
