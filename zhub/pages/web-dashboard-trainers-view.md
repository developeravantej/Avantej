# Trainers View

**Route:** `/dashboard/trainers/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx:1`
**Platform:** web
**Auth required:** rbac(`user_management:read`) — enforced via `requirePermission` in `beforeLoad`
**Last updated:** 2026-05-26

---

## 1. What It Does

**Purpose (user perspective):** Manage trainer members — add new trainers, update their profiles, configure availability, set per-service buffer times, and suspend/reactivate accounts. Each trainer card shows a tier badge; the detail panel has "Change Tier" and "Assign Branch" action buttons that open modal dialogs.

**Produces:** A two-panel master/detail layout: a 300 px left list with search, tier filter pills, and session counts; a right detail panel with KPI tiles, weekly schedule preview, certifications, and contact/branch info. A create/edit dialog (`TrainerFormDialog`) handles trainer creation and profile editing. "Change Tier" and "Assign Branch" buttons in the detail panel header open dedicated confirmation dialogs.

**On success:** New trainer created and profile upserted; existing trainer profile saved; status changes applied. All mutations invalidate trainer/trainerProfiles cache and show a success toast.

**On failure / error states:** Spinner while loading; empty state with "Add Trainer" CTA when no results; toast on mutation errors; "Select an organization" guard when no org is set.

---

## 2. How It Works

**Execution flow:**
```
TrainersListPage
  → useUserContext()                             # organizationId + hierarchyNodes (no extra API call)
  → useTrainerData(organizationId, debouncedSearch)
      → useQuery(["trainers", orgId])
          → client.members.list({ role: "trainer" })
      → useQuery(["trainerTiers", orgId])
          → client.trainerTiers.list({ includeInactive: false })
  → useQuery(["trainerWeeklyStatsBatch", orgId, memberIds])
      → client.trainers.weeklyStatsBatch({ organizationId, memberIds })
      # powers session-count column in the left list
  → useTrainerActions({ organizationId, onCreateSuccess, onUpdateSuccess })
      → createTrainer  → client.members.create + client.memberProfiles.upsert
      → updateProfile  → client.memberProfiles.upsert
      → suspend        → client.members.suspend
      → reactivate     → client.members.reactivate
      → assignTier     → client.trainerTiers.assignToMember
  → TrainerDetailPanel (lazy per selected trainer)
      → useQuery(["trainerWeeklyStats", orgId, trainer.userId])
          → client.trainers.weeklyStats({ organizationId, memberId })
      → useQuery(["trainerWeeklySchedule", orgId, memberId])
          → client.trainers.weeklySchedule({ organizationId, memberId })
  → ChangeTierDialog (when changeTierTarget set)
      → useQuery(["trainerTiers", orgId])         # shared cache, staleTime 60s
      → mutation → client.trainerTiers.assignToMember
      → invalidates ["trainers", orgId]
  → AssignBranchDialog (when assignBranchTarget set)
      → useQuery(["hierarchyNodes", orgId])
          → client.hierarchy.listNodes({ organizationId })
      → mutation → client.members.updateScope
      → invalidates ["trainers", orgId]
```

**Inputs:**
- Search field: client-side filter on name, email, displayName, specialization (300 ms debounce via `useDebounce`)
- Tier filter pills: client-side filter on `trainer.trainerTierId`; "All" pill resets to all trainers
- `TrainerFormDialog`: email (create only), hierarchyScopeId (create only), displayName, specialization, phoneNumber, bio, certifications (comma-separated string)
- "Change Tier" button in detail panel header → opens `ChangeTierDialog` with `<select id="tier-select">` (active tiers + "No tier" option); passing `tierId: null` unassigns
- "Assign Branch" button in detail panel header → opens `AssignBranchDialog` with `<select id="branch-select">` (depth-indented hierarchy nodes); save is disabled if selection equals current branch

**State management:**
- `search` / `debouncedSearch` — client-side text filter
- `tierFilter` (`"all"` | tierId) — client-side tier pill filter
- `selectedTrainer` — trainer selected in left list; detail panel auto-selects first on load if null
- `sheetOpen`, `editingTrainer` — `TrainerFormDialog` open/close and which trainer is being edited (null = create)
- `changeTierTarget: TrainerRow | null` — truthy when `ChangeTierDialog` should be open
- `assignBranchTarget: TrainerRow | null` — truthy when `AssignBranchDialog` should be open

**Outputs:** Two-panel layout — left list of trainer rows with tier badges and session counts; right detail panel with KPI tiles, schedule preview, certifications, and contact/branch card. `TrainerFormDialog` for create/edit. `ChangeTierDialog` and `AssignBranchDialog` for assignment actions.

**Side effects:** `useTrainerActions` mutations invalidate `["trainers", orgId]` and `["trainerProfiles", orgId]`. `ChangeTierDialog` and `AssignBranchDialog` each invalidate `["trainers", orgId]` on success and call the parent's `refetch()` via `onSuccess`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `members.list` — list trainer-role members (rbac: user_management:read) — via `useTrainerData`
- `memberProfiles.upsert` — create or update profile — via `useTrainerActions`
- `members.create` — add new trainer — via `useTrainerActions`
- `members.suspend` / `members.reactivate` — status management — via `useTrainerActions`
- `members.updateScope` — reassign a trainer to a different hierarchy node — via `AssignBranchDialog`
- `trainerTiers.list` — fetch active tiers for filter pills and `ChangeTierDialog` (includeInactive: false)
- `trainerTiers.assignToMember` — assign tier; `tierId: null` unassigns — via `useTrainerActions` (inline) and `ChangeTierDialog`
- `trainers.weeklyStatsBatch` — per-trainer session count for the left list column
- `trainers.weeklyStats` — KPI tiles for the selected trainer detail panel
- `trainers.weeklySchedule` — this-week schedule entries for the detail panel `SchedulePreviewCard`
- `hierarchy.listNodes` — hierarchy node list for `AssignBranchDialog`'s branch select

**Uses these components:**
- `TrainerFormDialog` — `apps/web/src/components/trainers/TrainerFormDialog.tsx` — create/edit dialog (replaces old Sheet approach)
- `ChangeTierDialog` — `apps/web/src/components/trainers/trainer-assignment-dialogs.tsx` — assign tier modal
- `AssignBranchDialog` — `apps/web/src/components/trainers/trainer-assignment-dialogs.tsx` — assign branch modal
- `TrainerListRow` — inline sub-component; left panel trainer row with avatar, tier badge, session count
- `TrainerDetailPanel` — inline sub-component; right panel with KPI tiles, schedule, certifications, contact
- `SchedulePreviewCard` — inline sub-component inside `TrainerDetailPanel`; this-week schedule strip
- `KpiTile` / `TierBadge` / `ActiveBadge` — small inline presentational components

**Uses these hooks:**
- `useTrainerData(organizationId, debouncedSearch)` — encapsulates trainer list + tier list queries
- `useTrainerActions({ organizationId, onCreateSuccess, onUpdateSuccess })` — encapsulates all mutations
- `useUserContext` — provides `organizationId` and hierarchy nodes (no extra API call needed)
- `useDebounce` — 300 ms debounce on the search input

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — "Trainers" link in the home nav group

**Navigation: where it goes:** No outbound navigation; all interactions happen in the Sheet.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `members` (tenant) | READ, UPDATE | `id`, `userId`, `role`, `hierarchyScopeId`, `status`, `joinedAt`, `trainerTierId` |
| `member_profiles` (tenant) | READ, UPSERT | `memberId`, `displayName`, `bio`, `specialization`, `phoneNumber`, `certifications` |
| `service_members` (tenant) | READ, UPDATE | `memberId`, `serviceId`, `bufferTimeMinutes` |
| `trainer_tiers` (tenant) | READ, UPDATE | `id`, `name`, `rank`, `isActive` |
| `members` (tenant) | UPDATE (scope) | `hierarchyScopeId` — updated by `AssignBranchDialog` via `members.updateScope` |

**Key types:**
```typescript
type TrainerRow = {
  id: string; userId: string; hierarchyScopeId: string; status: string;
  joinedAt: Date|string|null; name: string; email: string; trainerTierId?: string|null;
  displayName?: string|null; specialization?: string|null;
  phoneNumber?: string|null; bio?: string|null; certifications?: string[]|null;
}
```

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| email | email input | required on create | `members.create.email` |
| hierarchyScopeId | select | required on create | `members.create.hierarchyScopeId` |
| displayName | text | optional | `memberProfiles.upsert.displayName` |
| specialization | text | optional | `memberProfiles.upsert.specialization` |
| phoneNumber | tel | optional | `memberProfiles.upsert.phoneNumber` |
| bio | textarea | optional | `memberProfiles.upsert.bio` |
| certifications | text (comma-sep) | optional | `memberProfiles.upsert.certifications[]` |

---

## 5. Tests

**Test files:** None found for this page or its specific endpoints.

**Not tested (risk areas):**
- `ChangeTierDialog` `selectedTierId` sync — opens with `currentTierId`; if the parent's `trainerTierId` is stale after a previous assignment the pre-selection may be wrong
- `AssignBranchDialog` save guard (`canSave = selectedNodeId !== currentBranchId`) — deep-links or programmatic opens bypass the guard
- `batchStats` keyed by `trainer.userId` not `trainer.id` — mismatch would silently show "…" for all trainers
- Left-panel auto-select of first trainer: if the trainer list reorders after a refetch, the displayed detail panel may not match the highlighted row
- Tier filter client-side: does not reset `selectedTrainer` when the active trainer no longer matches the new filter

---

## 6. Notes

- `requirePermission` in `beforeLoad` is a stub in `route-guards.ts`; real RBAC is inside the API handler.
- The page component is `TrainersListPage` (in `apps/web/src/components/pages/trainers/trainers-list-page.tsx`), not a route file; the route simply renders it.
- Tier badge appearance is keyword-based: name containing "master" → black badge; "senior" → outlined gray; anything else (including "junior") → light gray.
- **Change Tier dialog (added 2026-05-26):** "Change Tier" button in `TrainerDetailPanel` header sets `changeTierTarget`. `ChangeTierDialog` fetches active tiers (shared TanStack cache), pre-selects `currentTierId`, and saves via `trainerTiers.assignToMember`; passing `tierId: null` (empty select) removes the tier.
- **Assign Branch dialog (added 2026-05-26):** "Assign Branch" button sets `assignBranchTarget`. `AssignBranchDialog` fetches all hierarchy nodes via `hierarchy.listNodes`, renders them depth-indented in a `<select>`. Save button is disabled until the selection differs from `currentBranchId`. Saves via `members.updateScope`.
- Both assignment dialogs live in `apps/web/src/components/trainers/trainer-assignment-dialogs.tsx` and use `useApiMutation` (toast on success/error) + `queryClient.invalidateQueries`.
- Hierarchy node list for `AssignBranchDialog` comes from a live API call (`hierarchy.listNodes`) — not from `userContext` — so it reflects all nodes, not just the caller's accessible subset.
- `TrainerFormDialog` handles both create and edit; the old Sheet approach is no longer used in this component.
