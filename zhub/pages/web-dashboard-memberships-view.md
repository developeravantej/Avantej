# Active Memberships

**Route:** `/dashboard/memberships/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/memberships/view.tsx:1`
**Platform:** web
**Auth required:** authenticated + `customer_management:read`
**Last updated:** 2026-04-19

---

## 1. What It Does

**Purpose:** Retention rep filters to "expiring in 7/30 days" or "frozen" and contacts at-risk members.

**Produces:** Tabbed table (All Active / Expiring 7d / Expiring 30d / Frozen / Expired). Columns: Customer, Package (service name), Credits Left/Total, Expires, Status.

**On success:** Row click opens the P1 `CustomerDetailSheet` drawer for the member.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext()
  → useQuery(["memberships", filter, branchId])
    → client.packageInstances.listMemberships({ organizationId, filter, branchId })
      → packageInstancesRouter.listMemberships   # rbac: customer_management:read
        → listMemberships()                      # service fn
          → package_instances + services join; filter switch on status + expiresAt window
          → cross-DB user name enrichment
```

**Row click:** passes `memberId` (from the package's clientId → member.id lookup) to `CustomerDetailSheet`.

---

## 3. What Depends On It

**API endpoints:**
- `packageInstances.listMemberships` — new in P2 (filter switch: active / expiring_7d / expiring_30d / expired / frozen / all)

**Components:** Reuses `CustomerDetailSheet` from P1 — critical integration point.

**Navigation: incoming:** Sidebar under BUSINESS > Appointments (Memberships entry).
**Navigation: outgoing:** drawer-only.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Notes |
|-------|-----------|-------|
| `package_instances` (tenant) | READ | filters on `status`, `expiresAt` (date arithmetic) |
| `services` (tenant) | READ JOIN | service name, sessionCount for credit displays |
| `members` (tenant) | READ JOIN | for memberId + hierarchyScopeId RBAC scope |
| `user` (control-panel) | READ batch | client name, email |

**MembershipRow type:**
```typescript
type MembershipRow = {
  id: string;
  memberId: string;           // added to enable drawer drill-in (P2 coordination patch)
  clientId: string;
  clientName: string;
  serviceName: string;
  creditsUsed: number;
  creditsTotal: number;
  status: "active" | "frozen" | "expired";
  expiresAt: Date | null;
};
```

---

## 5. Tests

None yet. Chrome-verified in P2 chrome-run (14 rows, drawer drill-in works).

---

## 6. Notes

- No `branchId` on `package_instances` — RBAC goes through linked `members.hierarchyScopeId` of the `clientId`.
- Admin sees everything; staff scoped by `getDescendantNodeIds(member.hierarchyScopeId)`.
- Shipped in tracking-pages plan phase 2 (2026-04-18).
