# Trainers

**Route:** `/dashboard/trainers/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx`
**Platform:** web
**Auth required:** `user_management:read`
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage trainer profiles, assignments, availability, services, and commission history within an organization.

**Produces:** Grid of trainer cards with quick tier selector, search bar, detail dialog, and edit sheet for full profile management.

**On success:** Card grid shows all trainers; clicking opens detail dialog; clicking "Edit Profile" or card opens side sheet for full editing.

**On failure / error states:** Loading spinner, empty state (no trainers), error banner with retry. Individual profile fetch failures handled gracefully with Promise.allSettled.

---

## 2. How It Works

**Execution flow:**
1. On mount: Fetch organizationId from useUserContext, verify org selected
2. Load queries (parallel):
   - `client.members.list({ organizationId, role: "trainer" })` → membersData
   - `client.memberProfiles.get()` for each trainer (parallel with Promise.allSettled) → profilesMap
   - `client.trainerTiers.list({ includeInactive: false })`
3. On sheet open (edit mode):
   - Load `client.serviceMembers.listForMember()` → assigned services
   - Load `client.services.list()` + `client.serviceCategories.list()` (when servicesSectionOpen)
   - Load `client.commissionSplits.listLedger()` (when commissionsSectionOpen)
4. User submit: creates or updates profile, then refetches
5. Service assignments: check/uncheck → assign/remove mutations with batch Promise.allSettled

**Inputs:**
- URL search param: none
- Sheet form: email, displayName, bio, specialization, phoneNumber, certifications (comma-separated)

**State management:**
- TanStack Query keys:
  - `["trainers", organizationId]` — member list
  - `["trainerProfiles", organizationId, [...memberIds]]` — profiles
  - `["trainerTiers", organizationId, "active"]` — tier dropdown
  - `["trainerServices", organizationId, editingMemberId]` — service assignments
  - `["allServices", organizationId]` — available services
  - `["allCategories", organizationId]` — service categories
  - `["trainerCommissions", organizationId, editingTrainerUserId]` — commission ledger
- Local state: sheetOpen, editingMemberId, form, search, buffer editor state, selectedTrainer (for detail dialog)

**Outputs:** Card grid, detail dialog, edit sheet with collapsible sections (Profile, Availability, Services, Commissions)

**Side effects:** 
- Tier assignment: `client.trainerTiers.assignToMember()` → invalidate trainers list
- Service assign/remove: invalidate `["trainerServices", ...]`
- Buffer update: invalidate trainerServices
- Profile create/update: invalidate both trainers & trainerProfiles

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.members.list()` — fetch trainers by role
- `client.memberProfiles.get()` — fetch individual trainer profile
- `client.members.create()` — add new trainer
- `client.memberProfiles.upsert()` — save profile (create & edit)
- `client.members.suspend()` — mark trainer suspended
- `client.members.reactivate()` — reactivate suspended trainer
- `client.trainerTiers.list()` — fetch active tiers only
- `client.trainerTiers.assignToMember()` — assign tier to trainer
- `client.serviceMembers.listForMember()` — fetch assigned services
- `client.services.list()` — fetch all active services
- `client.serviceCategories.list()` — fetch service categories
- `client.serviceMembers.assign()` — add service to trainer
- `client.serviceMembers.remove()` — remove service from trainer
- `client.serviceMembers.updateBuffer()` — set buffer time for service
- `client.commissionSplits.listLedger()` — fetch commission history

**Uses these components:**
- `TrainerAvailabilityEditor` — `@/components/trainers/trainer-availability-editor` — edit weekly availability
- `StatusBadge` — display status (active/inactive/suspended)
- `EmptyState` — empty state UI
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter` — side panel
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` — detail popup
- `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` — expandable sections
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` — dropdowns
- `Input`, `Textarea`, `Label`, `Button`, `Separator`, `Checkbox` — shadcn form elements
- lucide icons: `Users`, `Plus`, `Search`, `Edit`, `ChevronDown`, `Mail`, `Phone`, `Award`

**Uses these hooks:**
- `useUserContext()` — org context & hierarchy
- `useDebounce()` — 300ms debounce for search
- `useQueryClient()` — manual invalidation
- `useUserContext().hasRole()` — (unused in this file, but available)

**Navigation: who navigates here:** `/dashboard/trainers/view` route (protected by requirePermission)

**Navigation: where it goes:** None (internal page only)

---

## 4. Data Shapes

**DB tables touched:**
- `controlPanelDb.members` — read, create, suspend, reactivate
- `tenantDb.memberProfiles` — read, upsert
- `tenantDb.trainerTiers` — read, assign
- `tenantDb.trainerAvailability` — read, upsert (via TrainerAvailabilityEditor)
- `tenantDb.serviceMembers` — read, create, delete, update buffer
- `tenantDb.services` — read
- `tenantDb.serviceCategories` — read
- `tenantDb.commissionSplits` — read (ledger)

**Key types / Zod schemas:**
```typescript
type TrainerRow = {
  id: string; userId: string; hierarchyScopeId: string;
  status: string; joinedAt: Date | string | null;
  name: string; email: string; trainerTierId?: string | null;
  displayName?: string | null; specialization?: string | null;
  phoneNumber?: string | null; bio?: string | null;
  certifications?: string[] | null;
};

type FormState = {
  email: string; hierarchyScopeId: string;
  displayName: string; bio: string; specialization: string;
  phoneNumber: string; certifications: string; // comma-separated UI
};

type CommissionRow = {
  id: string; createdAt: string | Date; appointmentId?: string | null;
  salesOrderId?: string | null; appointmentNumber?: string | null;
  salesOrderNumber?: string | null; serviceName?: string | null;
  calculatedAmount: number; status: string;
};
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):** 
- Create trainer with email validation
- Edit profile (especially certification parsing)
- Service assignment/removal batch logic
- Buffer time update (parsing, validation, edge cases like 0 or null)
- Commission ledger rendering and formatting
- Tier assignment and tier selector interactions
- Debounced search performance

---

## 6. Notes

- **Complex state:** Lots of local state (sheet, editing, form, buffer editor, sections, selectedTrainer). Consider refactoring into smaller components if it grows
- **Parallel profile fetches:** Uses Promise.allSettled to gracefully handle individual profile failures
- **LEGACY warning absent:** Page is actively maintained, not marked for rewrite
- **Certification format:** UI uses comma-separated string, but stored as array in DB
- **Commission ledger:** Read-only collapsible section; shows up to 20 records; cross-DB query (userId from controlPanelDb, ledger from tenantDb)
- **Service checkbox batch logic:** When category checkbox is toggled, all services in that group are assign/removed in parallel
- **Tier selector:** Native HTML select, not component-based; directly assigned on change

