# Customer Orphan Cleanup Inventory

Generated: 2026-05-14

## Route Files

| File | Status | Reason |
|------|--------|--------|
| `apps/web/src/routes/_authenticated/dashboard/_layout/customers/view.tsx` | DELETE | Old list route; wraps `RegisteredCustomersPage`. Only imported by routeTree (auto-gen). |
| `apps/web/src/routes/_authenticated/dashboard/_layout/customers/$id.tsx` | DELETE | Old full-page Customer360 route. No callers once deep-links are updated. |
| `apps/web/src/routes/_authenticated/dashboard/_layout/customers/v2/view.tsx` | KEEP | The v2 replacement. |
| `apps/web/src/routes/_authenticated/dashboard/_layout/customers/walk-in/view.tsx` | DEEP-LINK CALLER | Uses `makeTabRedirect("/dashboard/customers/view", ...)` → update to v2. |

## Component Files

| File | Status | Reason |
|------|--------|--------|
| `apps/web/src/components/pages/customers/registered-page.tsx` | DELETE | Only consumed by the old `customers/view` route. |
| `apps/web/src/components/customers/customer-detail-sheet.tsx` | KEEP | Still used by `memberships-page.tsx` (not being deleted). |
| `apps/web/src/components/customers/customer-360/preferred-times-editor.tsx` | KEEP | Used by `package-row.tsx` which v2 also uses. |
| `apps/web/src/components/customers/customer-360/package-row.tsx` | KEEP | Used by v2 CustomerProfilePanel. |
| `apps/web/src/components/customers/customer-profile-panel.tsx` | KEEP | The v2 detail panel. |
| `apps/web/src/components/customers/customers-filter-sidebar.tsx` | KEEP | Used by v2/view.tsx. |

## Deep-Link Callers (need updating: old → v2)

| File | Line | Old Link | New Link |
|------|------|----------|----------|
| `apps/web/src/components/global-search/command-palette.tsx` | 128 | `to="/dashboard/customers/$id", params: {id}` | `to="/dashboard/customers/v2/view", search: {customer: id}` |
| `apps/web/src/components/dashboard/expiring-memberships-widget.tsx` | 94 | `to="/dashboard/customers/view", search: {customerId}` | `to="/dashboard/customers/v2/view", search: {customer: customerId}` |
| `apps/web/src/components/tables/sales/view/columns.tsx` | 103 | `to="/dashboard/customers/view", search: {customerId}` | `to="/dashboard/customers/v2/view", search: {customer: customerId}` |
| `apps/web/src/routes/_authenticated/dashboard/_layout/customers/walk-in/view.tsx` | 7 | `makeTabRedirect("/dashboard/customers/view", "registered")` | `makeTabRedirect("/dashboard/customers/v2/view", "customers")` |
| `apps/web/src/components/customers/customer-profile-panel.tsx` | 391 | `to="/dashboard/customers/view"` | `to="/dashboard/customers/v2/view"` |
