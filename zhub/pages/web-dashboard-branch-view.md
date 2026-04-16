# Branch View

**Route:** `/dashboard/branch/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Lists all hierarchy branches (depth-4 nodes) for the current organization in a data table, with inline editing, branch relocation, and member reassignment capabilities.

**Produces:** A data table of branches showing name, code, area/region/country, person-in-charge, address, and status. An inline edit dialog allows updating name, address, PIC, and area (with cascading dropdowns).

**On success:** Branch row reflects updated data after mutation; toast confirms success; hierarchy localStorage cache is cleared to force refresh.

**On failure / error states:**
- No org: toast "No organization selected" (shown once via ref guard).
- API error (UNAUTHORIZED): redirects to `/login`.
- Other API errors: toast with error message.
- Loading: implicit (no explicit loading skeleton shown — table renders empty initially).

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useAuth() + useUserContext() → organizationId (UUID-validated)
  → useQuery(["hierarchy-nodes", orgId])
      → localStorage cache (30s TTL) or client.hierarchy.listNodes()
  → useQuery(["branches", orgId])
      → localStorage cache (30s TTL) or client.hierarchy.listNodes()
      → mapBranchesWithHierarchy() — filters type="branch", traverses parent chain
  → <DataTable columns data={mappedBranches} />
  → Edit dialog: cascading country→region→area selects from allHierarchyNodes
      → updateMutation → client.hierarchy.updateNode({ nodeId, name, address, picUserId })
      → moveMutation → client.hierarchy.moveNode({ nodeId, newParentId })
  → <MemberReassignment> — reassign members between branches
  → <MemberSelector> — pick a PIC user
```

**Inputs:** No URL/query params; derives everything from `userContext` and `useAuth`.

**State management:**
- `allHierarchyNodes` state — synced from React Query via `useEffect`
- `isEditDialogOpen`, `editingBranch`, `editBranch*` local states for dialog form
- Cascading dropdowns: `editBranchCountryId → regions`, `editBranchRegionId → areas` (computed via `useMemo`)
- Two localStorage caches keyed by `org_{orgId}_hierarchy` and `org_{orgId}_hierarchy_timestamp`

**Outputs:** Updated `hierarchy_nodes` rows; cache invalidation for `["branches", orgId]` and `["user-context"]` queries.

**Side effects:**
- Clears `org_{orgId}_hierarchy` localStorage on successful update/move
- `queryClient.invalidateQueries(["user-context"])` on mutation success

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.hierarchy.listNodes` — fetch all hierarchy nodes (used for both branch list and edit dropdowns)
- `client.hierarchy.updateNode` — update branch name/address/picUserId
- `client.hierarchy.moveNode` — relocate branch under a different area

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/branch/view/data-table.tsx` — branch table
- `columns` — `apps/web/src/components/tables/branch/view/columns.tsx` — column definitions
- `MemberReassignment` — `apps/web/src/components/branch/member-reassignment.tsx` — reassign members
- `MemberSelector` — `apps/web/src/components/branch/member-selector.tsx` — pick PIC
- `Dialog`, `Transition` — `@headlessui/react` — edit dialog (not shadcn)

**Uses these hooks:**
- `useAuth` — `user`, `isAuthenticated`, `isLoading`
- `useUserContext` — current org context
- `useQuery` — hierarchy nodes + branch list
- `useMutation` — update + move branch
- `useNavigate` — redirect on UNAUTHORIZED
- `useMemo` — cascading dropdown derivations
- `useCallback` — `mapBranchesWithHierarchy`
- `useEffect` — sync nodes state, show org error toast

**Navigation: who navigates here:**
- `app-sidebar.tsx` — "View Branches" link under Hierarchy section
- `branch/create.tsx` — redirects here after successful creation

**Navigation: where it goes:**
- `/login` — on UNAUTHORIZED API error

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `hierarchy_nodes` | SELECT | `id`, `name`, `type`, `depth`, `parent_id`, `address`, `pic_user_id`, `created_at`, `updated_at` |
| `hierarchy_nodes` | UPDATE | `name`, `address`, `pic_user_id` (via updateNode) |
| `hierarchy_nodes` | UPDATE | `parent_id` (via moveNode — relocate) |

**Branch filtering logic:** Nodes with `type === "branch"` are included regardless of depth (depth=4 expected; wrong-depth nodes included with a console warning).

**Hierarchy mapping:** Each branch traverses `parentId` chain up to 3 levels to find area → region → country nodes for display.

---

## 5. Tests

**Test files:** None found

**Not tested:** Branch listing, edit dialog cascading, update/move mutations, localStorage cache logic, UNAUTHORIZED redirect

---

## 6. Notes

- This page uses `@headlessui/react` `Dialog` (not shadcn `Dialog`) for the edit modal — inconsistent with the rest of the codebase.
- `organizationId` is UUID-validated with a regex before use; non-UUID values (e.g., mock `"org-1"`) are treated as `null`.
- The localStorage cache has a 30-second TTL for both the branch query and the edit dropdown query. Cache is keyed to org ID.
- `mapBranchesWithHierarchy` includes a hardcoded target branch ID check for debugging (`7cce143b-...`) — leftover development artifact.
- Extensive `console.log`/`console.warn`/`console.error` statements remain in the data-fetch logic.
- No `beforeLoad` permission guard on this route.
- The file is over 600 lines with significant debug instrumentation that should eventually be cleaned up.
