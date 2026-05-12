# Announcements View

**Route:** `/dashboard/announcements/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/announcements/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (no explicit `beforeLoad` guard; server enforces `announcement_management` RBAC)
**Last updated:** 2026-05-09

---

## New in this update (2026-05-09)

- **Branch scope column** — table shows "Org-wide" badge when `scopedBranchIds` is empty; otherwise shows first 2 branch names with "+N" overflow tooltip. Branch names are resolved from a `hierarchy.listNodes` query (staleTime 5 min).
- **Branch scope checklist in create/edit dialogs** — hierarchy nodes rendered as an indented checkbox list (indentation by `node.depth * 12px`). Empty array = org-wide; selected IDs are sent as `scopedBranchIds`.
- **`scopedBranchIds` API field** — `announcements.create` and `announcements.update` now accept `scopedBranchIds: string[]`. The service writes to the `announcement_scopes` join table via `setAnnouncementScopes`.
- **`buildScopeFilter` service logic** — admins see all announcements; staff see: org-wide announcements (no scopes) OR scoped to their `accessibleNodeIds`. Empty `accessibleNodeIds` with non-admin role → sees only org-wide announcements (crash guard for `inArray` with empty array).
- **`AnnouncementWithScopes` return type** — `listAnnouncements` and `listActiveAnnouncements` now return `scopedBranchIds: string[]` alongside the base announcement row.
- **`isAdmin` param** on service — `announcements.list` passes `context.member.role === "admin"` to the service so `buildScopeFilter` skips filtering for admins.
- The create/edit UI was changed from a slide-out Sheet to a `Dialog` (same API, different UI component).

---

## 1. What It Does

**Purpose (user perspective):** Create, view, edit, deactivate, and delete organization announcements. Announcements can be org-wide or scoped to specific branches. Admins see all; staff see only announcements relevant to their accessible nodes.

**Produces:** A filterable table of announcements with title, priority badge, target audience, scope (org-wide or branch names), date range, pin indicator, and status. A Dialog for create/edit. Confirmation Dialogs for delete and deactivate.

**On success:**
- Create → toast "Announcement created successfully."; Dialog closes; table refreshes.
- Update → toast "Announcement updated successfully."; Dialog closes; table refreshes.
- Deactivate → toast "Announcement deactivated."; table refreshes.
- Delete → toast "Announcement deleted."; table refreshes.

**On failure / error states:**
- No `organizationId` → centered empty state "Select an organization to manage announcements."
- Loading → `PageLoader` spinner.
- Mutation error → destructive toast with error message.
- Form validation error → toast "Title and message are required." or "End Date must be after Start Date."
- API error → `StatusCallout` variant="error" with retry.

---

## 2. How It Works

**Execution flow:**
```
AnnouncementsViewPage
  → useUserContext() → organizationId
  → useQuery(["announcements", orgId, isActiveFilter])
      → client.announcements.list({ organizationId, isActive })
          → listAnnouncements(tenantDb, { isAdmin, accessibleNodeIds, ... })
              → buildScopeFilter (admins: no filter; staff: org-wide OR in accessibleNodeIds)
              → enrichWithScopes (batch fetch announcement_scopes → scopedBranchIds[])
  → useQuery(["hierarchy", "listNodes", orgId])    # staleTime: 5 min
      → client.hierarchy.listNodes({ organizationId })
      → builds nodeNameMap (id → name) for Scope column + checklist
  → client-side filter by targetAudience → filteredData
  → DataTable with inline columns including Scope column
  → Create/Edit Dialog:
      → Branch scope checklist (hierarchy nodes, indented)
      → createMutation: client.announcements.create({ ..., scopedBranchIds })
      → updateMutation: client.announcements.update({ ..., scopedBranchIds })
  → Deactivate Dialog:
      → deactivateMutation: client.announcements.update({ isActive: false })
  → Delete Dialog:
      → deleteMutation: client.announcements.delete()
```

**Inputs:**
- Status filter tab (active / inactive / all) — drives `isActive` param to API; encoded: `"active"→true`, `"inactive"→false`, `"all"→undefined`.
- Audience filter dropdown (all / staff / clients) — applied client-side after API response.

**State management:**
- `statusFilter`, `audienceFilter` — local state for filters.
- `sheetOpen`, `editingId`, `form` (including `scopedBranchIds: string[]`) — Dialog state.
- `deleteTarget`, `deactivateTarget` — confirmation dialog open state (IDs of target records).
- TanStack Query (`queryKey: ["announcements", organizationId, isActiveFilter]`).

**Branch scope checklist behavior:**
- Fetches all hierarchy nodes via `client.hierarchy.listNodes`; indented by `node.depth * 12px`.
- Selecting nodes adds their IDs to `form.scopedBranchIds`.
- Empty `scopedBranchIds` array on submit = org-wide announcement.
- Edit pre-populates `scopedBranchIds` from `row.scopedBranchIds ?? []`.

**Side effects:** All mutations invalidate `["announcements", organizationId]`. `createInvoice` and `matchInvoice` mutations additionally invalidate `["supplierInvoices", organizationId]` (not applicable here).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `announcements.list` — list announcements for org (params: `isActive`, `limit`, `offset`; server applies `buildScopeFilter` by role); returns `AnnouncementWithScopes[]` with `scopedBranchIds`
- `announcements.create` — create announcement; accepts `scopedBranchIds[]`; writes to `announcement_scopes` join table
- `announcements.update` — update or deactivate; accepts `scopedBranchIds[]`; replaces all scopes atomically (delete + insert)
- `announcements.delete` — hard-delete announcement
- `hierarchy.listNodes` — fetch all hierarchy nodes for branch name map and scope checklist

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx`
- `EmptyState` — `apps/web/src/components/ui/empty-state.tsx` — shown when `filteredData.length === 0`
- `StatusBadge` — `apps/web/src/components/ui/status-badge.tsx` — active/inactive status column
- `StatusCallout` — `apps/web/src/components/ui/status-callout.tsx` — error state with retry
- `Badge` — scope column "Org-wide" badge; priority badges
- `Checkbox` — branch scope checklist

**Uses these hooks:**
- `useUserContext` — resolves `organizationId`
- `useQuery`, `useMutation` via `useApiMutation`, `useQueryClient` — data fetching and mutations

**Navigation: who navigates here:**
- App sidebar: "Announcements" under the Announcements section

**Navigation: where it goes:** Stays on page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `announcements` (tenant) | SELECT | `id`, `title`, `message`, `priority`, `targetAudience`, `branchId`, `startDate`, `endDate`, `isPinned`, `isActive`, `createdAt` |
| `announcements` (tenant) | INSERT | All above except `id`, `createdAt` |
| `announcements` (tenant) | UPDATE | `title`, `message`, `priority`, `targetAudience`, `startDate`, `endDate`, `isPinned`, `isActive` |
| `announcements` (tenant) | DELETE | `id` |
| `announcement_scopes` (tenant) | SELECT (via `enrichWithScopes`) | `announcementId`, `branchId` |
| `announcement_scopes` (tenant) | INSERT / DELETE (via `setAnnouncementScopes`) | `announcementId`, `branchId` — full replace on every create/update |

**`buildScopeFilter` logic:**
```
isAdmin → undefined (no filter applied)
non-admin, accessibleNodeIds = [] →
  WHERE NOT EXISTS (SELECT 1 FROM announcement_scopes WHERE announcementId = announcements.id)
non-admin, accessibleNodeIds = [id1, id2, ...] →
  WHERE
    NOT EXISTS (SELECT 1 FROM announcement_scopes WHERE announcementId = announcements.id)
    OR EXISTS (SELECT 1 FROM announcement_scopes WHERE announcementId = announcements.id AND branchId IN (...accessibleNodeIds))
```
The empty-array guard prevents passing `inArray(..., [])` which would crash Drizzle.

**`AnnouncementWithScopes` type:**
```typescript
type AnnouncementWithScopes = typeof announcements.$inferSelect & {
  scopedBranchIds: string[];
};
```

**`AnnouncementRow` local type (route):**
```typescript
type AnnouncementRow = {
  id: string; title: string; message: string;
  priority: "low"|"normal"|"high"|"urgent";
  targetAudience: "all"|"staff"|"clients";
  branchId: string|null;
  startDate: string|null; endDate: string|null;
  isPinned: boolean; isActive: boolean; createdAt: string;
  scopedBranchIds?: string[];
};
```

**`FormState` local type (route):**
```typescript
type FormState = {
  title: string; message: string;
  priority: "low"|"normal"|"high"|"urgent";
  targetAudience: "all"|"staff"|"clients";
  startDate: string; endDate: string;
  isPinned: boolean;
  scopedBranchIds: string[];
};
```

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| Title | Text input | Required (non-empty) | `title` |
| Message | Textarea | Required (non-empty) | `message` |
| Priority | Select | low/normal/high/urgent | `priority` |
| Target Audience | Select | all/staff/clients | `targetAudience` |
| Branch Scope | Checkbox list (hierarchy nodes) | Empty = org-wide | `scopedBranchIds` |
| Start Date | datetime-local | Optional; before End Date | `startDate` (→ ISO string) |
| End Date | datetime-local | Optional; after Start Date | `endDate` (→ ISO string) |
| Pin to top | Checkbox | — | `isPinned` |

---

## 5. Tests

**Test files:**
- `apps/web/src/__tests__/components/announcements-widget.test.tsx` — tests the dashboard widget (`listActive`), not this full page.

**Scenarios covered (widget test):** Loading state, empty state, renders active announcements list.

**Not tested (risk areas):**
- Create/edit/delete/deactivate mutations
- Client-side audience filter
- Date validation (end after start)
- Branch scope checklist (selection, pre-population on edit, org-wide default)
- `buildScopeFilter` non-admin path (integration only, no unit test)

---

## 6. Notes

- `targetAudience` filter is applied client-side only (the API does not accept it as a query param).
- `isActive` filter is encoded: `"active"→true`, `"inactive"→false`, `"all"→undefined` (no filter).
- Dates are stored and sent as ISO strings; the datetime-local input value is sliced to 16 chars for display compatibility (`"YYYY-MM-DDTHH:MM"`).
- The legacy `branchId` column on the `announcements` table is still present but the UI no longer writes to it directly — branch scoping now uses the `announcement_scopes` join table via `scopedBranchIds`. `branchId` is still shown as `null` from existing rows and reported as "Org-wide" in the scope column.
- `setAnnouncementScopes` does a full delete + insert on every update — there is no partial merge.
- `DataTable` is reused from the sales module — no pagination, sorting, or column visibility controls are exposed on this page.
- API requires `announcement_management:read` (list), `:create` (create), `:update` (update/deactivate), `:delete` (delete) — all enforced server-side; no `beforeLoad` guard on this route.
- `enrichWithScopes` does a second DB round-trip after fetching announcements; it batches all IDs into a single `inArray` query on `announcement_scopes`.
- The create/edit UI uses `Dialog` (not a slide-out `Sheet`) — earlier doc described it as a Sheet but the current implementation renders `DialogContent`.
