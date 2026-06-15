# Trainers Tab — Component Map

**Route:** `/dashboard/trainers/view?tab=trainers`
**Audited:** 2026-05-25
**Primary file:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx`

---

## Component Tree

```
TrainersTabPage  (view.tsx:25)
  └─ [tab === "trainers" default branch]  (view.tsx:108)
       └─ TrainersListPage  (trainers-list-page.tsx:563)
            ├─ useUserContext()                           → reads organizationId + hierarchyNodes from context (no extra API call)
            ├─ useState: search, debouncedSearch, tierFilter, selectedTrainer, sheetOpen, editingTrainer
            ├─ useDebounce(search, 300)                   → debounced client-side filter
            │
            ├─ useTrainerData(organizationId, debouncedSearch)   [hooks/useTrainerData.ts:13]
            │    ├─ useQuery ["trainers", orgId]
            │    │    └─ client.members.list({ organizationId, role: "trainer" })
            │    │         → memberRouter.list  (members/list.procedures.ts)
            │    │         → DB: members table (tenant) — reads id, userId, role, hierarchyScopeId, status, joinedAt, trainerTierId
            │    ├─ useQuery ["trainerProfiles", orgId, memberIds]
            │    │    └─ Promise.allSettled(client.memberProfiles.get() per trainer)
            │    │         → memberProfilesRouter.get
            │    │         → DB: member_profiles table (tenant) — reads memberId, displayName, bio, specialization, phoneNumber, certifications
            │    │    NOTE: allSettled → failed profiles silently return null fields
            │    └─ useQuery ["trainerTiers", orgId, "active"]
            │         └─ client.trainerTiers.list({ organizationId, includeInactive: false })
            │              → trainerTiersRouter.list  (trainer-tiers.ts:15)
            │              → DB: trainer_tiers table (tenant) — reads id, name, rank, isActive
            │
            ├─ useTrainerActions(...)   [hooks/useTrainerActions.ts:15]
            │    ├─ createTrainer mutation
            │    │    ├─ client.members.create(...)          → members/create.procedures.ts
            │    │    │    → RBAC: user_management:create
            │    │    │    → DB writes: members (tenant) + organization_members (control panel)
            │    │    └─ client.memberProfiles.upsert(...)   → memberProfilesRouter.upsert
            │    │         → DB write: member_profiles (tenant) — memberId, displayName, bio, specialization, phoneNumber, certifications
            │    ├─ updateProfile mutation
            │    │    └─ client.memberProfiles.upsert(...)   → same as above
            │    ├─ suspend mutation
            │    │    └─ client.members.suspend(...)         → members/status.procedures.ts
            │    │         → RBAC: user_management:update
            │    │         → DB write: members.status = "suspended" (tenant) + organization_members.status (control panel)
            │    │         → also writes audit_log (tenant)
            │    ├─ reactivate mutation
            │    │    └─ client.members.reactivate(...)      → members/status.procedures.ts
            │    │         → RBAC: user_management:update
            │    │         → DB write: members.status = "active" (tenant) + organization_members.status (control panel)
            │    │         → also writes audit_log (tenant)
            │    └─ assignTier mutation  ⚠ DECLARED BUT NEVER CALLED
            │         → client.trainerTiers.assignToMember(...)
            │         → RBAC: trainer_tier_management:update
            │         → DB write: members.trainerTierId (tenant)
            │
            ├─ useQuery ["trainerWeeklyStatsBatch", orgId, memberIds]
            │    └─ client.trainers.weeklyStatsBatch({ organizationId, memberIds })
            │         → trainersRouter.weeklyStatsBatch  (trainers.ts:121)
            │         → RBAC: user_management:approve
            │         → DB: appointments + class_slots tables (tenant) — reads session counts per trainer
            │
            ├─ [LEFT PANEL] TrainerListRow × n  (trainers-list-page.tsx:97)
            │    └─ Renders: avatar, displayName|name, TierBadge, specialization|email, weekSessions count
            │
            ├─ [RIGHT PANEL] TrainerDetailPanel  (trainers-list-page.tsx:327)
            │    ├─ useQuery ["trainerWeeklyStats", orgId, trainer.userId]
            │    │    └─ client.trainers.weeklyStats({ organizationId, memberId: trainer.userId })
            │    │         → trainersRouter.weeklyStats  (trainers.ts:29)
            │    │         → RBAC: user_management:read + (self OR user_management:approve)
            │    │         → DB: appointments + commission_splits tables — sessionsThisWeek, commissionYtd, revenueGenerated, utilizationPct
            │    ├─ SchedulePreviewCard  (trainers-list-page.tsx:210)
            │    │    └─ useQuery ["trainerWeeklySchedule", orgId, trainer.userId]
            │    │         └─ client.trainers.weeklySchedule({ organizationId, memberId })
            │    │              → trainersRouter.weeklySchedule  (trainers.ts:83)
            │    │              → RBAC: appointment_management:read
            │    │              → DB: appointments + class_slots tables (tenant)
            │    └─ "Change Tier" button → onEdit(trainer) → opens TrainerFormDialog  ⚠ DOES NOT call assignTier
            │       "Assign Branch" button → onEdit(trainer) → opens TrainerFormDialog  ⚠ DOES NOT assign branch
            │       "Suspend" / "Reactivate" buttons → suspend.mutate / reactivate.mutate
            │
            └─ [DIALOG] TrainerFormDialog  (trainers/TrainerFormDialog.tsx:95)
                 ├─ STATE: profileSectionOpen, availabilitySectionOpen, servicesSectionOpen, commissionsSectionOpen
                 ├─ [CREATE MODE ONLY] email input + hierarchyScopeId Select
                 │    Validation: email required (toast), hierarchyScopeId required (toast)
                 │    NOTE: hierarchyScopeId dropdown shows all nodes from userContext — no disabled guard
                 │          when hierarchyNodes.length === 0, shows disabled "No nodes available" item
                 │          but form can still be submitted (validation only checks !form.hierarchyScopeId which IS empty)
                 ├─ [PROFILE section — always visible, default open]
                 │    displayName, specialization, phoneNumber, bio, certifications (comma-sep string)
                 ├─ [AVAILABILITY section — edit mode only, default closed]
                 │    └─ TrainerAvailabilityEditor  (trainers/trainer-availability-editor.tsx:66)
                 │         ├─ useQuery ["trainer-availability", trainerId]
                 │         │    └─ client.trainerAvailability.list({ organizationId, trainerId })
                 │         │         → trainerAvailabilityRouter.list  (trainer-availability.ts:35)
                 │         │         → DB: trainer_availability table (tenant) — reads dayOfWeek, startTime, endTime
                 │         └─ saveMutation
                 │              └─ client.trainerAvailability.upsert({ organizationId, trainerId, slots })
                 │                   → trainerAvailabilityRouter.upsert  (trainer-availability.ts:91)
                 │                   → RBAC: appointment_management:update
                 │                   → DB write: trainer_availability table (tenant) — replace-all for trainerId
                 │                   NOTE: client sends slots without `kind` field; router schema has kind.default("available") so defaults to "available"
                 ├─ [SERVICES section — edit mode only, default closed]  (trainers/TrainerServicesSection.tsx:32)
                 │    ├─ useQuery ["trainerServices", orgId, memberId]   (enabled: isOpen)
                 │    │    └─ client.serviceMembers.listForMember(...)
                 │    │         → serviceMembersRouter.listForMember  (service-members.ts:149)
                 │    │         → RBAC: user_management:read OR service_management:read
                 │    │         → DB: service_members + member_service_buffer_overrides (tenant)
                 │    ├─ useQuery ["allServices", orgId]   (enabled: isOpen)
                 │    │    └─ client.services.list({ organizationId, isActive: true })
                 │    ├─ useQuery ["allCategories", orgId]   (enabled: isOpen)
                 │    │    └─ client.serviceCategories.list({ organizationId })
                 │    ├─ useQuery ["categoryBufferOverrides", orgId, memberId]   (enabled: isOpen)
                 │    │    └─ client.categoryBufferOverrides.listForMember(...)
                 │    │         → categoryBufferOverridesRouter.listForMember
                 │    ├─ assignMutation → client.serviceMembers.assign(...)
                 │    │    → serviceMembersRouter.assign  (service-members.ts:213)
                 │    │    → RBAC: user_management:update OR service_management:update
                 │    │    → DB write: service_members (tenant) — memberId, serviceId, isPrimary=false
                 │    ├─ removeMutation → client.serviceMembers.remove(...)
                 │    │    → serviceMembersRouter.remove  (service-members.ts:342)
                 │    │    → DB write: deletes from service_members + member_service_buffer_overrides (tenant)
                 │    ├─ updateBufferMutation → client.serviceMembers.updateBuffer(...)
                 │    │    → serviceMembersRouter.updateBuffer  (service-members.ts:258)
                 │    │    → RBAC: user_management:update OR service_management:update
                 │    │    → DB write: member_service_buffer_overrides (tenant) — memberId, serviceId, bufferTimeMinutes
                 │    │         null → deletes override (revert to category default)
                 │    └─ updateCategoryBufferMutation → client.categoryBufferOverrides.upsert(...)
                 │         → DB write: category_buffer_overrides (tenant)
                 └─ [COMMISSIONS section — edit mode only, default closed]  (trainers/TrainerCommissionsSection.tsx:41)
                      └─ useQuery ["trainerCommissions", orgId, trainerUserId]   (enabled: isOpen)
                           └─ client.commissionSplits.listLedger({ organizationId, staffId, limit: 20, offset: 0 })
                                → commissionSplitsRouter.listLedger
                                → DB: commission_splits table (tenant) — last 20 rows
                                NOTE: read-only, no pagination beyond the 20-record limit
```

---

## Mutations Summary Table

| Mutation | oRPC call | RBAC required | DB table(s) written | Key columns |
|----------|-----------|---------------|---------------------|-------------|
| createTrainer (step 1) | `members.create` | user_management:create | `members` (tenant), `organization_members` (ctrl panel) | role, hierarchyScopeId, status, userId |
| createTrainer (step 2) | `memberProfiles.upsert` | user_management:create (inherited) | `member_profiles` (tenant) | memberId, displayName, bio, specialization, phoneNumber, certifications |
| updateProfile | `memberProfiles.upsert` | same as above | `member_profiles` (tenant) | same |
| suspend | `members.suspend` | user_management:update | `members` (tenant), `organization_members` (ctrl panel), `audit_log` (tenant) | status="suspended" |
| reactivate | `members.reactivate` | user_management:update | `members` (tenant), `organization_members` (ctrl panel), `audit_log` (tenant) | status="active" |
| assignTier | `trainerTiers.assignToMember` | trainer_tier_management:update | `members` (tenant) | trainerTierId |
| saveAvailability | `trainerAvailability.upsert` | appointment_management:update | `trainer_availability` (tenant) | trainerId, dayOfWeek, startTime, endTime, kind (defaults to "available") |
| assignService | `serviceMembers.assign` | user_management:update OR service_management:update | `service_members` (tenant) | memberId, serviceId, isPrimary=false |
| removeService | `serviceMembers.remove` | same as above | `service_members` + `member_service_buffer_overrides` (tenant) | — |
| updateBuffer | `serviceMembers.updateBuffer` | same as above | `member_service_buffer_overrides` (tenant) | memberId, serviceId, bufferTimeMinutes |
| updateCategoryBuffer | `categoryBufferOverrides.upsert` | same as above | `category_buffer_overrides` (tenant) | memberId, categoryId, bufferTimeMinutes |

---

## Key Risks Identified

1. **assignTier dead code** (`trainers-list-page.tsx:590`, `hooks/useTrainerActions.ts:102`): `assignTier` is destructured from `useTrainerActions` but never invoked. The "Change Tier" button in `TrainerDetailPanel` opens the edit form dialog, which has no tier field. Tier assignment is completely inaccessible from this tab.

2. **weeklyStatsBatch RBAC elevation** (`trainers.ts:121`): `weeklyStatsBatch` requires `user_management:approve`, which is an admin-level permission. Staff-role trainers visiting the page will see "…" session counts for all trainer rows because the batch call returns a 403 — no fallback rendering.

3. **Profile fetch silent failures** (`useTrainerData.ts:47`): `Promise.allSettled` means a trainer whose profile fetch fails silently shows null for displayName, specialization, etc. — no error indicator in the UI, making it impossible to distinguish "no profile" from "profile fetch failed".

4. **Availability upsert missing kind field** (`trainer-availability-editor.tsx:100`): The `upsert` client call omits the `kind` field per slot. The server schema has `kind: kindSchema.default("available")` so it defaults safely, but any existing "blocked" or "timeoff" slots are silently overwritten to "available" when the user saves availability.

5. **"Assign Branch" button is a no-op** (`trainers-list-page.tsx:426`): The "Assign Branch" button in `TrainerDetailPanel` calls `onEdit(trainer)`, which opens the profile edit form. There is no branch/hierarchyScopeId field in the edit form (it's create-only). Branch reassignment is not possible from the UI.
