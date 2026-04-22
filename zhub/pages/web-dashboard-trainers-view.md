# Trainers View

**Route:** `/dashboard/trainers/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx:1`
**Platform:** web
**Auth required:** rbac(`user_management:read`) — enforced via `requirePermission` in `beforeLoad`
**Last updated:** 2026-04-22 (Pipeline Audit C.2)

---

## 1. What It Does

**Purpose (user perspective):** Manage trainer members — add new trainers, update their profiles, configure availability, set per-service buffer times, and suspend/reactivate accounts. Each trainer row has an inline Tier dropdown for commission tier assignment. Each trainer row has an inline Tier dropdown for commission tier assignment. Each trainer row has an inline Tier dropdown for commission tier assignment.

**Produces:** A searchable data table of all trainer-role members with profile details merged in; a side Sheet for create/edit with collapsible sections for profile, weekly availability, services, and commission ledger.

**On success:** New trainer created and profile upserted; existing trainer profile saved; status changes applied. All mutations invalidate trainer/trainerProfiles cache and show a success toast.

**On failure / error states:** Spinner while loading; empty state with "Add Trainer" CTA when no results; toast on mutation errors; "Select an organization" guard when no org is set.

---

## 2. How It Works

**Execution flow:**
```
TrainersView
  → useUserContext()                         # reads organizationId + hierarchy nodes
  → useQuery(["trainers", orgId])
    → client.members.list({ role: "trainer" })
      → memberRouter.list                    # rbac: user_management:read
        → members table (tenant DB)
  → useQuery(["trainerProfiles", orgId, memberIds])
    → Promise.allSettled(client.memberProfiles.get() for each trainer)
      → member_profiles table (tenant DB)
  → useQuery(["trainerTiers", orgId, "active"])
    → client.trainerTiers.list({ organizationId, includeInactive: false })
      → trainer_tiers table (tenant DB)
  → useQuery(["trainerServices", orgId, memberId])   # lazy: only when servicesSectionOpen
    → client.serviceMembers.listForMember(...)
  → createMutation
    → client.members.create(...)             # role="trainer"
    → client.memberProfiles.upsert(...)
  → updateProfileMutation → client.memberProfiles.upsert(...)
  → suspendMutation    → client.members.suspend(...)
  → reactivateMutation → client.members.reactivate(...)
  → updateBufferMutation → client.serviceMembers.updateBuffer(...)
  → assignTierMutation
    → client.trainerTiers.assignToMember({ organizationId, memberId, tierId })
      → trainerTiersRouter.assignToMember    # rbac: trainer_tier_management:update
  → useQuery(["trainerCommissions", orgId, staffId])  # lazy: only when commissionsSectionOpen
    → client.commissionSplits.listLedger({ organizationId, staffId: editingTrainerUserId, limit: 20, offset: 0 })
```

**Inputs:**
- Search field: client-side filter on name, email, displayName, specialization (300 ms debounce)
- Sheet form: email (create only), hierarchyScopeId (create only), displayName, specialization, phoneNumber, bio, certifications (comma-separated string)
- Availability editor: delegated to `TrainerAvailabilityEditor`
- Buffer times: numeric input per service (0–480 min; empty = use category default → stored as `null`)
- Tier dropdown (inline on card): selecting a tier calls `assignToMember`; selecting "No tier" passes `tierId: null` to unassign
- Tier dropdown (inline on card): selecting a tier calls `assignToMember`; selecting "No tier" passes `tierId: null` to unassign

**State management:**
- `search` / `debouncedSearch` — client-side filter
- `sheetOpen`, `editingMemberId`, `form` — Sheet open/close and form values
- `profileSectionOpen`, `availabilitySectionOpen`, `servicesSectionOpen`, `commissionsSectionOpen` — collapsible sections
- `editingBufferServiceId`, `bufferInputValue` — inline buffer row editor
- `selectedTrainer` — trainer clicked on card (opens detail dialog)

**Outputs:** Grid of trainer cards with tier selector dropdowns; Sheet opens for create/edit; detail modal on card click.

**Side effects:** `queryClient.invalidateQueries` on trainers and trainerProfiles after any mutation. Tier assignment invalidates trainers cache. Tier assignment invalidates trainers cache.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `members.list` — list trainer-role members (rbac: user_management:read)
- `memberProfiles.get` — per-trainer profile (parallel fetch)
- `memberProfiles.upsert` — create or update profile
- `members.create` — add new trainer
- `members.suspend` / `members.reactivate` — status management
- `serviceMembers.listForMember` — service assignments (for buffer section)
- `serviceMembers.updateBuffer` — save per-service buffer time
- `trainerTiers.list` — fetch active tiers for the tier dropdown (includeInactive: false)
- `trainerTiers.assignToMember` — assign tier to trainer; removes assignment if tierId is null
- `commissionSplits.listLedger` — lazy-loaded when Commissions section is opened; fetches trainer's commission history (Date, Source, Amount, Status); status badges: pending=yellow, approved=blue, paid=green, void=gray

**Uses these components:**
- `TrainerAvailabilityEditor` — `apps/web/src/components/trainers/trainer-availability-editor.tsx` — weekly availability CRUD inside the Sheet
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — click-to-copy cells

**Uses these hooks:**
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
| `trainer_tiers` (tenant) | READ, UPDATE | `id`, `name`, `rank`, `isActive` |

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
- Profile fetch silently drops failures (`Promise.allSettled`) — a trainer with no profile record shows all-null fields rather than an error
- Buffer time saved as empty string maps to `null` (use default) — no explicit validation
- Hierarchy dropdown with zero nodes (shows disabled placeholder but form still submits)
- Tier dropdown on card may not properly refresh when tier assignment changes elsewhere
- Tier dropdown on card may not properly refresh when tier assignment changes elsewhere

---

## 6. Notes

- `requirePermission` in `beforeLoad` is a stub in `route-guards.ts`; real RBAC is inside the API handler.
- Profile data is fetched with `Promise.allSettled` so a missing profile record does not block the rest.
- Certifications stored as `string[]` in DB; UI uses a comma-separated string — conversion happens in mutation helpers.
- The Availability section only renders when `editingMemberId` is set (edit mode only).
- Buffer times section is lazy-loaded (gated by `servicesSectionOpen`) to avoid N+1 calls on open.
- **TRAINER TIERS (added 2026-04-22):** Card grid includes inline dropdown to select tier. Fetches active tiers from `trainerTiers.list`. Selecting a tier or "No tier" calls `assignToMember` which can set or clear the tier assignment. Tier ID persisted in `members.trainerTierId`.
- **COMMISSIONS section** (added 2026-04-20): read-only collapsible inside the edit Sheet alongside PROFILE / WEEKLY AVAILABILITY / SERVICES. Lazy-loads `commissionSplits.listLedger({ staffId: editingTrainerUserId })` when first opened. Shows last 20 splits; no pagination currently.
- Hierarchy node list is sourced from `userContext.organizations[].hierarchy.nodes` — already in context, no extra API call.
