# Walk-in Customers View — DEPRECATED

**Route:** `/dashboard/customers/walk-in/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/customers/walk-in/view.tsx:1`
**Platform:** web
**Auth required:** (formerly rbac(`walk_in_customer_management:read`)) — now irrelevant; route is a dead redirect
**Last updated:** 2026-04-21

---

## 1. What It Does

**Status: DEPRECATED.** The walk-in customers feature was removed on 2026-04-21.

This route still exists in the file system but serves only as a redirect. It redirects any visitor to `/dashboard/customers/view?tab=registered`. There is no UI rendered.

The `WalkInCustomersPage` component (`apps/web/src/components/pos/walk-in-page.tsx`) has been **DELETED**.

---

## 2. How It Works

```
/dashboard/customers/walk-in/view
  → makeTabRedirect({ tab: "registered" })
    → navigates to /dashboard/customers/view?tab=registered
```

No queries, no mutations, no UI rendered. The route file contains only the redirect logic.

---

## 3. API Router Status

The `walkInCustomers` router (`packages/api/src/routers/walk-in-customers.ts`) is **fully stubbed**:

- `walkInCustomers.list` — always returns `{ items: [], total: 0 }` (no DB access)
- `walkInCustomers.getById` — throws `BAD_REQUEST("Walk-in customers have been removed")`
- `walkInCustomers.create` — throws `BAD_REQUEST("Walk-in customers have been removed")`
- `walkInCustomers.update` — throws `BAD_REQUEST("Walk-in customers have been removed")`
- `walkInCustomers.deactivate` — throws `BAD_REQUEST("Walk-in customers have been removed")`

The underlying `walk-in-customers.service.ts` file has been **DELETED**.

The `walk_in_customers` DB table still exists in the schema but is no longer written to by any application code.

---

## 4. Notes

- Anonymous walk-ins are now handled at the attendance (check-in) level via an optional `clientDisplayName` field on the `check_ins` table — no separate DB record needed.
- The POS flow treats walk-in as fully anonymous (`customerType: "walk_in"`, no DB lookup).
- Walk-in + package purchases are now **BLOCKED** at the POS (`BAD_REQUEST` thrown by `pos.recordSale` before the transaction opens).
