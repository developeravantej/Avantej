# Audit Log

**Route:** `/dashboard/audit/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/audit/view.tsx:1`
**Platform:** web
**Auth required:** authenticated + `audit_log:read`
**Last updated:** 2026-04-19

---

## 1. What It Does

**Purpose:** "Who did what when" — Manager surface for reviewing writes across phases (sale.create, refund.*, checkin.*, member.deactivate, commission.*, etc.).

**Produces:** Columns: When, Actor (name + avatar), Action, Entity, Summary, Details (expand JSON delta). Filters: actor combobox, action type, entity type, date range.

**On success:** Table renders paginated with cross-DB actor enrichment.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useQuery(["auditLogs", filters])
    → client.auditLogs.list({ organizationId, actor, action, entityType, from, to })
      → auditLogsRouter.list              # rbac: audit_log:read
        → listAudit()                     # service fn
          → audit_logs (tenant, introduced in migration 0019)
          → cross-DB user name enrichment for actor
```

---

## 3. What Depends On It

**API endpoints:**
- `auditLogs.list` — filtered + paginated with cross-DB name enrichment

**Write-side contract:** Every write happens via `writeAudit(tx, { action, entityType, entityId, branchId, summary, changes, actor })` INSIDE the same transaction as the data change. Used by P4 (sale.create), P5 (refund.*), P6 (commission.*), P7 (checkin.*), and member deactivate/reactivate/role-change.

**Navigation: incoming:** Sidebar under OPERATIONS > Audit Log.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Notes |
|-------|-----------|-------|
| `audit_logs` (tenant) | READ | `action`, `entityType`, `entityId`, `branchId`, `summary`, `changes` (jsonb), `actorId`, `actorMemberId`, `actorRole`, `createdAt` |
| `user` (control-panel) | READ batch | actor name enrichment |

**Action vocabulary (canonical list in `audit-log.service.ts`):**
`sale.create`, `sale.refund.request|approve|reject|process`, `checkin.create|delete`, `member.deactivate|reactivate|role_change`, `commission.create|approve|mark_paid|void`, `promotion.deactivate`, etc.

---

## 5. Tests

None yet. Chrome-verified in P3 chrome-run (`checkin.create` row appeared for Bryan Voo drop-in).

---

## 6. Notes

- `writeAudit` accepts `TenantDb | TenantTx` — MUST be called inside the same tx as the data change so it rolls back on failure.
- Shipped in tracking-pages plan phase 3 (2026-04-18). Migration `0019_audit_logs`.
