# Generated Page Context Documentation — 2026-04-23

## Summary

Generated 8 page-context documentation files for the Avantej web dashboard. All files follow the standard template with sections for purpose, execution flow, API endpoints, components, hooks, data shapes, tests, and implementation notes.

## Files Generated

### Active Pages (Functional Components)

1. **web-dashboard-customers.md** — `/dashboard/customers/view`
   - Registered customer directory with search, branch filtering, pagination
   - Calls: `client.customerDirectory.list()`
   - Permissions: `customer_management:read`
   - Status: Production

2. **web-dashboard-expenses.md** — `/dashboard/expenses/view`
   - Expense submission and approval workflow
   - Calls: `client.expenses.list|create|approve|reject|markPaid()`
   - Permissions: `expense_management:create`, `expense_management:update`
   - Status: Production (with tests)
   - Note: Fully tested in `src/__tests__/routes/expenses.test.tsx`

3. **web-dashboard-inventory-options.md** — `/dashboard/inventory-options`
   - Tab-based inventory management (Brands, Categories, Suppliers)
   - Thin wrapper delegating to child components
   - Delegated API calls (per tab)
   - Status: Production

4. **web-dashboard-my-services.md** — `/dashboard/my-services/view`
   - Personal service assignments with buffer time override management
   - Calls: `client.serviceMembers.listMine|updateMyBuffer()`
   - Status: Production
   - Note: Not covered by automated tests; buffer logic is custom

5. **web-dashboard-notifications.md** — `/dashboard/notifications/view`
   - Notification history with read/unread filtering
   - Calls: `client.notifications.list|markRead|markAllRead()`
   - Status: Production
   - Note: Not covered by automated tests

### Legacy Redirect Stubs (Do Not Extend)

6. **web-dashboard-customers-walkin.md** — `/dashboard/customers/walk-in/view`
   - Redirect → `/dashboard/customers/view?tab=registered`
   - Status: Legacy (scheduled for rewrite)

7. **web-dashboard-memberships.md** — `/dashboard/memberships/view`
   - Redirect → `/dashboard/packages/view?tab=memberships`
   - Status: Legacy (scheduled for rewrite)

8. **web-dashboard-packages-installments.md** — `/dashboard/packages/installments/view`
   - Redirect → `/dashboard/packages/view?tab=installments`
   - Status: Legacy (scheduled for rewrite)

---

## Key Patterns Observed

### 1. Org Guard Pattern
All pages check `userContext?.currentOrganizationId` and render guard message if missing:
```tsx
if (!organizationId) {
  return <div>Select an organization to view...</div>;
}
```

### 2. Query Cache Keys
Consistent TanStack Query key structure:
```tsx
["entityType", organizationId, filterValue?, offset?]
```

### 3. Permission Checks
Pages that modify data check permissions before rendering action buttons:
```tsx
const canCreate = hasPermission("entity:create");
const canUpdate = hasPermission("entity:update");
```

### 4. Error Handling
Standard toast notifications for API errors:
```tsx
onError: (error: unknown) => {
  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  toast.error(`Failed to action: ${message}`);
}
```

### 5. Mutation Invalidation
Query invalidation on success to trigger refetch:
```tsx
queryClient.invalidateQueries({
  queryKey: ["expenses", organizationId],
});
```

---

## Notable Gaps & Risk Areas

### Testing Coverage
- **Expenses**: ✓ 5 test scenarios (renders, heading, tabs, table, pending actions)
- **My Services**: ✗ No tests found
- **Notifications**: ✗ No tests found
- **Customers**: ✗ No tests found (high risk: complex filtering logic)

### Untested Logic
- Hierarchy-based branch filtering (`accessibleNodeIds`)
- Form validation edge cases (URL parsing, numeric parsing, empty vs. null)
- Query refetch on filter/org change
- Sheet/dialog open/close lifecycle
- Relative time formatting in notifications
- Permission re-check on org switch
- Pagination edge cases (offset > total)

### Missing Documentation
- `makeTabRedirect()` behavior (used by 3 legacy routes)
- `useDebounce()` hook behavior
- `formatPrice()` helper (currency conversion logic)
- `CustomerDetailSheet` mutation endpoints

---

## File Locations

All documentation files are written to:
```
C:/Project/Avantej/zhub/pages/
```

### Output Files
- `web-dashboard-customers.md` — 162 lines
- `web-dashboard-customers-walkin.md` — 67 lines
- `web-dashboard-expenses.md` — 199 lines
- `web-dashboard-inventory-options.md` — 92 lines
- `web-dashboard-memberships.md` — 67 lines
- `web-dashboard-my-services.md` — 173 lines
- `web-dashboard-notifications.md` — 167 lines
- `web-dashboard-packages-installments.md` — 68 lines

**Total**: ~995 lines of documentation

---

## API Endpoints Summary

### Active Endpoints Used

| Endpoint | Pages | Purpose |
|---|---|---|
| `client.customerDirectory.list()` | Customers | Fetch paginated customer directory |
| `client.expenses.*()` | Expenses | Expense CRUD (list, create, approve, reject, markPaid) |
| `client.serviceMembers.listMine()` | My Services | Fetch user's assigned services |
| `client.serviceMembers.updateMyBuffer()` | My Services | Update personal buffer time override |
| `client.notifications.list()` | Notifications | Fetch notifications with read filter |
| `client.notifications.markRead()` | Notifications | Mark single notification as read |
| `client.notifications.markAllRead()` | Notifications | Bulk mark all as read |
| `client.brands.list()` | Inventory Options | Delegate (via tab component) |
| `client.categories.list()` | Inventory Options | Delegate (via tab component) |
| `client.suppliers.list()` | Inventory Options | Delegate (via tab component) |

---

## Component Dependencies

### Shared UI Components
- `DataTable<T>` — used in 4+ pages for data rendering
- `Button`, `Input`, `Select`, `Badge` (shadcn/ui) — everywhere
- `Sheet`, `Dialog` — modals/overlays
- `EmptyState` — no-data fallback
- `StatusBadge` — status indicator

### Custom Components
- `CustomerDetailSheet` — customers detail editing
- `InventoryOptionsDashboard` — inventory tabs wrapper
- `BrandsTabPage`, `CategoriesTabPage`, `SuppliersTabPage` — inventory tabs

### Hooks
- `useUserContext()` — org ID, permissions, hierarchy
- `useQuery()` — data fetching
- `useMutation()` — mutations
- `useQueryClient()` — cache invalidation
- `Route.useSearch()` / `Route.useNavigate()` — routing

---

## Next Steps for Hub Maintainers

1. **Add missing tests**: Cover untested logic in My Services, Notifications, Customers
2. **Document utilities**: Create docs for `makeTabRedirect()`, `useDebounce()`, `formatPrice()`
3. **Add risk assessments**: Review hierarchy filtering, pagination, form validation
4. **Track legacy routes**: Monitor walk-in/memberships/installments for removal timelines
5. **Schema definitions**: Extract and document Zod schemas for each API endpoint

---

Generated: 2026-04-23 | Last Updated: 2026-04-23
