# User Roles View

**Route:** `/dashboard/role/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/role/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** View all roles configured in the organization — both system roles and custom roles — with their name, description, priority, and ID.
**Produces:** A sortable table listing all roles ordered by priority (highest first).
**On success:** Role rows appear in the table.
**On failure / error states:**
- No organization: query is disabled (`enabled: !!organizationId`), table renders empty.
- Loading: centered spinner.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId
  → useQuery via orpc.roles.list.queryOptions({ input: { organizationId } })
      → rolesRouter.list (packages/api/src/routers/roles.ts)
        → requirePermission(tenantDb, member, "user_management", "read")
        → tenantDb.select().from(roles).orderBy(desc(roles.priority))
      → returns RoleRow[]
  → <DataTable columns={columns} data={data} />
```

**Inputs:** `organizationId` from user context (no user-facing filters or forms).
**State management:** TanStack Query cache; no local state.
**Outputs:** Table with columns: Role Name (badge, "System" badge if `isSystem`), Description, Priority, Created At, ID (copyable, truncated).
**Side effects:** None — read-only page.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `roles.list` — list all roles ordered by priority desc; requires `user_management:read`.

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/role/view/data-table.tsx` — generic table wrapper.
- `columns` — `apps/web/src/components/tables/role/view/columns.tsx` — column definitions with inline `CopyableCell`.

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId`.
- `useQuery` (TanStack Query via `orpc.roles.list.queryOptions`).

**Navigation: who navigates here:** Sidebar "People → User → User Roles" link (`apps/web/src/components/app-sidebar.tsx:214`).
**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `roles` | SELECT | `id`, `name`, `description`, `isSystem`, `priority`, `createdAt`, `updatedAt` |

**Key types:**
```typescript
type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  priority: number; // 1–99 custom; 100 = admin system role
  createdAt: Date;
  updatedAt: Date;
};
```

---

## 5. Tests

**Test files:** None found for this route or component.
**Scenarios covered:** N/A
**Not tested:** Loading state, empty org state, column rendering.

---

## 6. Notes

- This page is read-only — there are no create, edit, or delete actions on the UI. Role management (create/update/delete) is handled elsewhere (the router at `packages/api/src/routers/roles.ts` exposes those procedures but this page does not call them).
- System roles (`isSystem: true`) are shown but cannot be modified or deleted via the API — enforced server-side.
- Priority 100 is reserved for the admin system role; custom roles must use 1–99.
- The columns file implements its own inline `CopyableCell` component instead of importing from `@/components/tables/copyable-cell` — minor inconsistency with other pages.
- Note: "Access Control → Role Management" in the sidebar points to a different route (`/dashboard/access-control/roles`); this page is listed under "User Roles" in the People section.
