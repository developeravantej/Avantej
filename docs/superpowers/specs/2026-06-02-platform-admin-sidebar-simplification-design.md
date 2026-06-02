# Platform Admin Sidebar Simplification — Design

**Date:** 2026-06-02 · **Status:** approved (verbal) → implementing · **Approach:** B (Trim + System group)

## Problem

The Platform Admin sidebar group renders **13 flat nav items** (11 for platform admins + Migrations/Admins for super_admin). Many are lenses on two core objects (Tenants, Money) and several are also surfaced inside the tenant drill-in tabs — the flat list is high-clutter and buries the daily-core items among infrequent ops tools.

## Decision

Reduce the **primary** Platform Admin nav from 11 → 5, collapse the rare ops tools into a **System** subgroup, and unify the money pages under Billing via a route-level tab bar. Nothing is removed from reach.

### Resulting nav

```
PLATFORM ADMIN
  Mission Control
  Tenants
  Billing            ← route-tab bar: Overview · Revenue · Renewals · Payments
  Health
  Comms
  ── System ──────────  (collapsible, defaultOpen: false)
  Webhooks
  Audit
  Users
  Migrations   *super_admin
  Admins       *super_admin
```

## Implementation

**File 1 — `apps/web/src/components/app-sidebar.tsx`**
- Replace the hand-coded inline Platform Admin block (1 flat group, ~170 lines) with a data-driven section: `PLATFORM_ADMIN_PRIMARY` (5 items) + `PLATFORM_ADMIN_SYSTEM` (5 items, `superAdmin` flag on Migrations/Admins) rendered by a small `PlatformAdminItem`.
- Primary items in a `SidebarGroup` labelled "Platform Admin"; System items in a **collapsible** `SidebarGroup` reusing the existing collapsible markup (toggle button + `ChevronRight` + `useState`), `defaultOpen: false`.
- `Revenue`, `Renewals`, `Payments` removed as sidebar items (reachable via Billing tabs).
- super_admin gating on Migrations/Admins preserved (`role === "super_admin"` filter). No import changes (the 3 dropped money icons remain used by the tenant nav).

**File 2 — `apps/web/src/components/platform-admin/money-hub-tabs.tsx` (new)**
- A route-level tab strip: 4 `<Link>`s (Overview→`/billing`, Revenue→`/revenue`, Renewals→`/renewals`, Payments→`/payments`), active derived from `useLocation().pathname.startsWith`.
- Routes + page components are **unchanged**; the tab bar is purely additive navigation. No route moves, no redirects, no broken deep links.

**Files 3–6 — money pages** (`billing.tsx`, `revenue.tsx`, `renewals.tsx`, `payments.tsx`)
- Render `<MoneyHubTabs />` as the first child of each page's `<div className="p-6 space-y-6">` wrapper, above the existing `<header>`. (Billing keeps its existing in-page shadcn `<Tabs>` for invoices/refunds/coupons as sub-content.)

## Non-goals
- No change to routes, RBAC, page logic, or the tenant-facing nav.
- No folding of Health into Tenants (kept primary per Approach B; Approach A's deeper fold deferred).

## Verify
- `bun check-types` (web) green.
- `bun check` (oxlint) green — no unused imports.
- Manual: each primary item loads; System toggles open/closed; each Billing tab navigates and highlights.
