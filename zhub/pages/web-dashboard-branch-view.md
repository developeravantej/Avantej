# Branch View

**Route:** `/dashboard/branch/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** List, edit, and manage all branches in the organization's hierarchy with cascading dropdowns (country → region → area → branch). Supports in-place edit/delete operations and member reassignment.

**Produces:** A data table showing branches with columns for name, code, area, region, country, person in charge, address, and action buttons (edit/delete). Header includes title and "Create Branch" button.

**On success:** Normal flow displays branch list. Edit/delete mutations invalidate cached queries and show toast confirmation.

**On failure / error states:**
- Loading: spinner shown during initial data fetch
- Empty: "No branches found" message with optional "Create Branch" action
- Auth error: toast + redirect to `/login`
- API error: toast with error message
- No org: toast warning about missing organization

---

## 2. How It Works

**Execution flow:**
1. Route loads; calls `useAuth()` and `useUserContext()` hooks
2. Extracts `organizationId` from user context (UUID validation to avoid mock IDs)
3. Fetches hierarchy nodes via `client.hierarchy.listNodes({ organizationId })`
   - Attempts localStorage cache first (30s TTL)
   - Falls back to API if cache stale/empty
4. Maps hierarchy nodes to branch records with resolved parent IDs (area, region, country)
5. Fetches organization members via `client.members.list()`
6. Resolves person-in-charge (PIC) user IDs to names/emails via member map
7. Renders data table with edit/delete/move handlers
8. Edit dialog allows updating branch name, address, PIC, and area reassignment
9. Delete mutation checks for child nodes and assigned members before removal

**Inputs:**
- URL params: none
- Query params: none
- User context: current organization ID

**State management:**
- TanStack Query: `["branches", organizationId]`, `["hierarchy-nodes", organizationId]`, `["members", organizationId]`
- Local state: `isEditDialogOpen`, `editingBranch`, edit field values (name, address, PIC, area/region/country)
- localStorage caching: `org_{organizationId}_hierarchy`, `org_{organizationId}_hierarchy_timestamp`

**Outputs:**
- Renders: branch data table, edit dialog, empty state
- Mutations: update, move, delete branch
- Cache invalidation: refetch branches, hierarchy nodes, user context on success

**Side effects:**
- Queries refetch on window focus and mount
- localStorage reads/writes for hierarchy caching
- Toast notifications for errors and success
- Navigation to login on auth failure

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.hierarchy.listNodes({ organizationId })` — fetch all hierarchy nodes (countries, regions, areas, branches)
- `client.members.list({ organizationId })` — fetch org members for PIC resolution
- `client.hierarchy.updateNode({ organizationId, nodeId, name, address, picUserId })` — update branch details
- `client.hierarchy.moveNode({ organizationId, nodeId, newParentId })` — move branch to different area
- `client.hierarchy.deleteNode({ organizationId, nodeId })` — delete branch

**Uses these components:**
- `DataTable` — `@/components/tables/branch/view/data-table` — renders branch rows with actions
- `columns` — `@/components/tables/branch/view/columns` — column definitions
- `MemberReassignment` — `@/components/branch/member-reassignment` — reassign members within edit dialog
- `MemberSelector` — `@/components/branch/member-selector` — select PIC from members
- `Dialog`, `Transition` — headlessui dialog + transitions for edit dialog
- Button, Input, Label, Select, Card — shadcn/ui form/layout components
- `EmptyState` — `@/components/ui/empty-state` — render when no branches

**Uses these hooks:**
- `useAuth()` — get user + auth status
- `useUserContext()` — get org context + permission checking
- `useNavigate()` — navigate on errors
- `useQuery()` — fetch hierarchy, members, branches
- `useMutation()` — update, move, delete operations
- `useState()` — manage edit dialog and form state
- `useMemo()` — compute cascading dropdown options (countries, regions, areas)
- `useCallback()` — memoize edit/delete handlers

**Navigation: who navigates here:**
- From `/dashboard/branch/create` after creation (intended)
- "Create Branch" button on this page links to `/dashboard/branch/create`

**Navigation: where it goes:**
- Redirects to `/login` on auth failure

---

## 4. Data Shapes

**DB tables touched:**
- `hierarchy_nodes` (tenantDb) — SELECT (listNodes), UPDATE (updateNode), DELETE (deleteNode), UPDATE (moveNode)
- `organization_members` (tenantDb) — SELECT (members list) for PIC resolution
- `users` (controlPanelDb) — implicit, via members

**Key types / Zod schemas:**
```typescript
type HierarchyNode = {
  id: string;
  name: string;
  type: string; // "branch", "area", "region", "country"
  depth: number;
  parentId: string | null;
  code?: string | null;
  address?: string | null;
  picUserId?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

type MappedBranch = {
  id: string;
  name: string;
  code: string;
  area_id: string;
  organization_id: string;
  person_in_charge: { name: string; email: string };
  area: { name: string; region: { name: string; country: { name: string } } };
  location: { address: string };
};
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Edge case: organizationId validation (UUID regex)
- Cache expiry and fallback logic
- Circular reference detection in moveNode
- Concurrent edit operations
- Member reassignment validation
- Cascading delete prevention (child nodes / assigned members)

---

## 6. Notes

- **Large file (1019 lines):** Complex state management with cascading dropdowns, caching, and multi-step edit flow
- **localStorage caching strategy:** 30s TTL to balance freshness vs. performance; fallback to API if stale
- **Hierarchy mapping:** Builds node lookup map to traverse parents for area → region → country resolution
- **Member resolution:** PIC user IDs resolved to names/emails via members query; fallback to "Unknown" if not found
- **Edit dialog:** Includes nested `MemberReassignment` component for reassigning members to other branches
- **Error handling:** Granular toast messages for different error types (circular ref, duplicate name, permission denied, etc.)
- **Performance concern:** Re-fetches entire hierarchy on every edit; consider incremental updates for large organizations
