# My Commissions

**Route:** `/dashboard/commissions/my`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/my.tsx:1`
**Platform:** web
**Auth required:** authenticated (no extra permission — own data)
**Last updated:** 2026-04-19

---

## 1. What It Does

**Purpose:** Per-staff view of own commission splits. Visible to all authenticated staff regardless of `commission_management:read`.

**Produces:** Table (Date, Source, Service, Branch, Split %, Amount, Status). No bulk actions.

---

## 2. How It Works

```
RouteComponent
  → useQuery(["myCommissions"])
    → client.commissionSplits.getMyCommissions({ organizationId })   # existing procedure
```

Reuses existing `getMyCommissions` endpoint. No permission gate in the page — own data is always accessible.

---

## 3. What Depends On It

**API endpoints:** `commissionSplits.getMyCommissions` (pre-existing).

**Navigation: incoming:** "My Commissions" button on `/dashboard/commissions/view`.

---

## 4. Data Shapes

Same `commission_splits` rows filtered to `staffId = current user.id` server-side.

---

## 5. Tests

None. Chrome-verified: page renders with current dev tenant (empty — no commission config).

---

## 6. Notes

- Shipped in tracking-pages plan phase 6 (2026-04-19). See also `web-dashboard-commissions-view.md` for the admin ledger surface.
