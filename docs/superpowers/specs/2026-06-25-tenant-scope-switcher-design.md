# Tenant Dashboard Scope Switcher — Design Spec

- **Date:** 2026-06-25 (revised 2026-06-26)
- **Status:** Approved (design); Phase 0 merged (PR #58). **Revised 2026-06-26: (a) global sidebar switcher → per-module switcher (shared scope); (b) any-level `scopeNodeId` + backend subtree conversion (§0.1, §5.3).**
- **Surface:** Tenant dashboard (`apps/web`, `/dashboard/*`) — **not** the control-panel / platform-admin surface
- **Branch:** `fix/tenant-multi-country-region-support` (Phase 0 merged to `main`)

## 0. Revision note (2026-06-26)

Original design put a **single global switcher in the sidebar**. Per client feedback, the switcher is now **rendered per-module** (in each module's header) — Commissions, Employees, Reports, etc. — while the picked scope is **shared** across modules (pick once, applies everywhere). RBAC is unchanged and central: the switcher only exposes `accessibleNodeIds`, so a branch manager never sees regional data, and the server enforces it. See §3 decision 7, §4.3, §4.7, §5.1, §8.

### 0.1 Revision note (2026-06-26 b) — any-level `scopeNodeId` + backend subtree conversion

A privileged user (owner, regional manager) must be able to scope to **any hierarchy level they can access** — country / region / state / branch — not just a leaf branch. Two consequences, both quantified by the backend read-proc audit `wf_8e9e02ad-94e` (16 modules):

1. **`scopeBranchId` → `scopeNodeId`.** The value the switcher feeds into queries may be any node id, not a leaf. The server **expands** it: `targetIds = getDescendantNodeIds(scopeNodeId) ∩ accessibleNodeIds`, then filters `inArray(branchId, targetIds)`.
2. **Phase 0.5 grows from "4 guards" to a backend subtree-conversion pass.** Most module read-procs filter by **exact-equality** (`eq(col, input.branchId)` / `resolveBranchFilter` → `[branchId]`) — which returns **zero rows** for a non-leaf node, because business rows carry leaf branch ids. They must convert to subtree expansion. The **guard layer is unchanged**: `guardBranchAccessible` already accepts any accessible node (leaf or intermediate), since `accessibleNodeIds` = the member's scope + all descendants. See the rewritten §5.3.

This is a coordinated **FE + BE refactor**, not just FE wiring. FE foundation barely changes (the `<ScopeSwitcher/>` already renders the full country→state→branch tree); the bulk is the BE conversion in §5.3.

## 1. Problem

Client question:

> "This account is only for 1 country only right? Doesn't seem like there's a way to cycle across different region/country/state."

The multi-country **structure** already exists and works: a tenant org has a tree of `organization → country → state → branch` hierarchy nodes (verified live — Test Fitness Franchise has Malaysia / Singapore / Thailand / USA), branch CRUD syncs to GoHighLevel, and RBAC scopes data by `accessibleNodeIds`.

What is missing is the **navigation layer**: there is no UI control to pick a country / state / branch and have the dashboard load that scope's data. The closest existing affordance is the sidebar org button (`app-sidebar.tsx`), which renders a chevron implying it is switchable but has **no `onClick` and no menu** — a dead control that actively reinforces the client's "no way to cycle" impression.

Today the active scope is **fixed at login**: every scoped query keys off the member's `hierarchyScopeId` / `accessibleNodeIds` from `useUserContext`, and there is no runtime way to change it.

## 2. Goal / Non-goals

**Goal:** A scope switcher, rendered **in each branch-scoped module's header**, that lets a user pick any hierarchy node within their access (country / state / branch, plus a scoped "All"). The picked scope is **shared** across modules (one source of truth) and re-scopes **read/analytics** surfaces to that node. Safe by construction — the switcher can only ever *narrow* within the user's server-derived access.

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
| 7 | Placement & state | **Per-module** switcher (rendered in each branch-scoped module's header), with **one shared** `activeScopeId` across modules. NOT a single global sidebar control. POS is special: its picker sets the *recording* branch (a write target), not a read filter. |

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

- Implemented as a small `ScopeProvider` (or a focused extension of `useUserContext`) exposing `{ activeScopeId, setActiveScope, activeScopeNode, accessibleNodeIds, scopeNodeId, isAllScope }`.
- `activeScopeId` / `scopeNodeId` may be **any** accessible hierarchy node (country / region / state / branch), not only a leaf branch. `scopeNodeId` = the exact value consumers inject into a query's `branchId`/`hierarchyScopeId` input: `undefined` when "All" (server uses full `accessibleNodeIds`), else `activeScopeId`.
- **Server-side expansion (the key BE rule):** a scoped read receives a possibly-non-leaf `scopeNodeId` and must filter by its accessible **subtree**, `inArray(branchId, getDescendantNodeIds(scopeNodeId) ∩ accessibleNodeIds)` — never `eq(branchId, scopeNodeId)` (that returns zero rows for a country/region). Centralized in a `resolveScopeNodeIds(tenantDb, scopeNodeId, accessibleNodeIds)` helper (§5.3).
- **Default** = member's `hierarchyScopeId` (owner → org root → "All").
- **Persisted** in `localStorage` under a key namespaced by `(userId, organizationId)`.
- **Validated on load:** if the persisted id is not in `accessibleNodeIds` (access revoked) or the node no longer exists (deleted), discard and fall back to `hierarchyScopeId`. Never trust localStorage blindly.
- Resets when the org changes.

This is the one genuinely cross-cutting change: the god-node `useUserContext` is consumed widely, so the new context is introduced alongside it and adopted page-by-page (see phasing).

### 4.3 Switcher UI — a reusable per-module control (revised)

A single reusable component **`<ScopeSwitcher/>`** (`apps/web/src/components/scope/ScopeSwitcher.tsx`) is dropped into **each branch-scoped module's header** (next to the page title / existing filters). It is NOT in the sidebar; the dead sidebar org button is left as-is (or shows a read-only active-scope label — non-goal to wire it).

- Renders a searchable tree/dropdown of `accessibleNodeIds`, grouped `country → state → branch`, plus a top **"All"** entry = the caller's top accessible node.
- Reads/writes the **shared** `activeScopeId` from the scope context (§4.2), so picking in one module updates every module.
- If the user has exactly 1 accessible node → renders a **static label**, no dropdown (e.g. a branch manager sees "Branch X", cannot switch).
- Modules that already ship an ad-hoc branch `<Select>` (Sales, Commissions, Attendance, Audit Log) replace it with `<ScopeSwitcher/>` so there is one consistent control bound to the shared scope.

### 4.4 Read pages consume the shared scope

Each module's data hooks inject `scopeNodeId` (from the scope context: `activeScopeId` — any hierarchy level — when narrowed, `undefined` when "All" → server falls back to full `accessibleNodeIds`) into their already-guarded oRPC queries' existing `branchId`/`hierarchyScopeId` input. The server expands the supplied node to its accessible subtree (§4.2, §5.3). See §4.7 for the module list and §8 for the rollout order.

### 4.5 Write flows untouched

POS sale and create-member keep their explicit per-operation branch `<Select>`, seeded from `activeScopeId` but independently confirmed. No write path is auto-driven by the switcher.

### 4.6 "All" view & multi-currency money (Layout C)

- "All" = the caller's top accessible node; backend already aggregates via `getDescendantNodeIds(scopeId)` (verified — selecting the org root on the Branch Overview shows org-wide totals).
- Counts (members, staff, appointments) aggregate into the top KPI tiles normally.
- **Revenue must never be summed across currencies.** When scope = "All" and the subtree spans multiple country currencies, render a **per-country card grid** (each card in its own currency) instead of a single revenue tile. For a single-node scope (one currency), keep the normal KPI tiles.

### 4.7 Module coverage (from the `module-scope-classification` audit, run `wf_389ee646-f0c`)

Only modules whose **primary data is branch/hierarchy-scoped** get a switcher. Org-level/meta modules do not.

**Wave 1 — 16 branch-scoped modules (get `<ScopeSwitcher/>`):**
Overview · Reports · Approvals · Customers · Appointments · Class Slots · Trainers · Services · Announcements · Sales & Payments · Commissions · Expenses · Packages · Employees · Attendance · Staff Access.

**Wave 2 — 3 (opt-in, extra work):**
- **Payouts** — `payouts.list` has **no `branchId` param** today → add param + guard first (§5.3).
- **POS** — switcher sets the **recording branch** (write target), not a read filter — distinct UX; seeded from the shared scope but explicitly confirmed.
- **Dashboard** — personal launcher hub; lower value, last.

**Excluded — org-level / meta (no switcher):** Tax Rates · Roles · Branches (it *is* the hierarchy editor) · Org Settings · Google Calendar · Notification Preferences · Email · GHL Integration.

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

> **Phase 0 status:** DONE — all 17 guarded + a `/code-review`-found regression fixed; merged in PR #58 (merge commit `fc408dbb`).

### 5.3 Phase 0.5 — backend `scopeNodeId` subtree conversion (per-module switcher prerequisite)

> **Rewritten 2026-06-26 (b)** after the 16-module read-proc audit (`wf_8e9e02ad-94e`). The original "add 4 guards" plan was insufficient: the real prerequisite is converting **exact-equality** filters to **subtree expansion** so a non-leaf `scopeNodeId` returns the right rows. Phase 0 already guarded the by-id read leaks; Phase 0.5 fixes the **list/analytics** filter semantics.

**Two load-bearing audit findings:**
1. **Guards are already non-leaf-safe — only the FILTER breaks.** `guardBranchAccessible(id, accessibleNodeIds)` accepts ANY node in `accessibleNodeIds` (= member scope + all descendants, intermediate nodes *and* leaves). Picking a region passes; a forged out-of-scope id still returns `FORBIDDEN`. ⇒ no guard signature changes. (⚠️ Verify at impl: `getDescendantNodeIds` must return intermediate nodes, not only leaves — the model rests on this.)
2. **Dominant filter = exact-equality** (`eq(col, input.branchId)` / `resolveBranchFilter` → `[branchId]`), which returns **zero rows** for a non-leaf node (rows carry leaf branch ids).

**Conversion (centralized):** add a `resolveScopeNodeIds(tenantDb, scopeNodeId, accessibleNodeIds)` helper = `scopeNodeId ? getDescendantNodeIds(scopeNodeId) ∩ accessibleNodeIds : accessibleNodeIds`, and route every scoped read through it (`inArray(col, resolveScopeNodeIds(...))`). Converting the existing `resolveBranchFilter` chokepoint fixes all 3 analytics KPI procs at once.

**Audit classification (counts; full file:line list in the Phase-1 plan §"Phase 0.5"):**
- **A — needs-conversion (equality → subtree), ~20 procs across 13 routers:** analytics (getDashboardKpis / getStaffPerformance / getRevenueSeries), members.list, appointments.list, services.list, salesOrders (list / kpiSummary / largestToday / getLatest), commissions (liabilityByStaff / listCommissionLedger), expenses.list, class-slots (list / bookingCounts), customerDirectory (list / getStats), announcements.list, packageInstances.listMemberships, approvals.listPending, attendance (listTodaysBookings / list), pos.searchCustomers.
- **B — needs-param-added (no scope input today → add `branchId?`/`scopeNodeId?` then expand), ~6:** analytics series ×4 (memberCount / churn / ltv / classFillRate), payouts.list (was the old "0.5-D"), announcements.listActive.
- **C — already subtree-ready (reference patterns, no change):** commissionSplits.liabilitySummary / exportLiabilityCsv, packageInstances.listAll, customerDirectory.getById.
- **D — by-id / unscoped (post-filter guard already correct, no switcher change):** class-slots.getById, payouts.recipientSummary, pos.getReceiptData.

Each A/B router is one TDD task (pick non-leaf → subtree rows; out-of-scope → `FORBIDDEN`; leaf → that branch only). This is the bulk of Phase 1's new work and a hard prerequisite before the FE rollout reaches a converted query.

### 5.4 Structural safeguards
- **Regression tests:** for each fixed procedure, an out-of-scope id → `FORBIDDEN` / `NOT_FOUND`.
- **Optional CI gate:** flag by-id `findFirst` reads on branch-scoped tables that lack a branch guard (12 of 17 Phase 0 leaks share this shape).

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
- **Auto-scoping write flows** (POS recording branch is explicitly confirmed, not auto-driven).
- **Reclassifying the `trusts-fixed-scope` set** (`cancelledSales` / `households` / `commissionCycle`, §5.2) — not surfaced by a Wave-1/2 module, but harden before any future module exposes them.

(Note: consolidating the scattered ad-hoc per-page branch `<Select>`s into the shared `<ScopeSwitcher/>` is now **in scope** — §4.3.)

## 8. Phasing

```
Phase 0    SECURITY PREREQUISITE — DONE (merged PR #58, fc408dbb)
           17 by-id read leaks guarded; regression tests; review fix.

Phase 0.5  BACKEND scopeNodeId SUBTREE CONVERSION (blocks the switcher)
           • 0.5-CORE: resolveScopeNodeIds() helper + convert resolveBranchFilter
             (fixes all 3 analytics KPI procs at once)
           • Group A: ~20 equality→subtree conversions (one TDD task per router)
           • Group B: ~6 add-param-then-expand (analytics series ×4, payouts.list,
             announcements.listActive)
           Guard layer UNCHANGED (Phase 0 covered by-id reads). §5.3.

Foundation SCOPE CONTEXT + REUSABLE CONTROL
           • ScopeProvider/useScope: shared activeScopeId, default = member top node,
             localStorage per (user,org), validated vs accessibleNodeIds, org-reset
           • <ScopeSwitcher/> reusable component (accessibleNodeIds tree + "All";
             1 node → static label)

Rollout    PER-MODULE (one thin task each: render <ScopeSwitcher/> in header
           + inject scopeNodeId into the module's guarded queries + RBAC test)
           • Wave 1 (16): Overview, Reports, Approvals, Customers, Appointments,
             Class Slots, Trainers, Services, Announcements, Sales & Payments,
             Commissions, Expenses, Packages, Employees, Attendance, Staff Access
             — Overview also gets the "All" per-country money cards (Layout C)
           • Wave 2 (3): Payouts (after its Phase-0.5 param), POS (recording-branch
             UX, not a filter), Dashboard
```

The switcher must not reach queries until Phase 0.5 merges green. Phase 0 already merged.

## 9. Testing
- **Phase 0 (done) / 0.5:** unit/integration regression per guarded procedure (out-of-scope id/branch → `FORBIDDEN`); confirm admin org-wide preserved.
- **Foundation:** ScopeProvider unit tests (default, persistence, stale-fallback, org-switch reset); `<ScopeSwitcher/>` tests (renders only `accessibleNodeIds`; 1 node → static label; setter rejects out-of-scope).
- **Per-module:** for each module, a test that the active scope flows into its query; **RBAC journey (the client's rule):** branch-manager login sees only their branch (static label, no regional option) in **every** module's switcher, and a forged regional `scopeId` → `FORBIDDEN`. Chrome-MCP: owner switches MY → SG → All; confirm Commissions, Employees, Reports, etc. all re-scope consistently from the shared selection.

## 10. Open Risks
- Phase 0 is sizeable (17+ procedures across many routers). It is independently valuable (closes existing intra-tenant leaks) and can ship before any switcher work.
- `useUserContext` is a god-node; introducing `ScopeProvider` beside it (not replacing) keeps the blast radius incremental.
