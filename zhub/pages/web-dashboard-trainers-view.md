# Trainers

**Route:** `/dashboard/trainers/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx:1`
**Platform:** web
**Auth required:** authenticated + `user_management:read` permission (checked via `beforeLoad`)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Lets admins manage trainer members — view profiles, add new trainers, edit profile info, manage weekly availability, configure per-category buffer times, and suspend/reactivate accounts.
**Produces:** A searchable table of trainers with a multi-section slide-in sheet for create/edit.
**On success:** Toast notification and relevant query cache invalidated.
**On failure / error states:** Spinner while loading; "Select an organization" prompt; empty state with "Add Trainer" CTA; toast errors.

---

## 2. How It Works

**Execution flow:**
```
TrainersView
  → requirePermission("user_management:read") [beforeLoad guard]
  → useUserContext() → organizationId, hierarchy nodes
  → useDebounce(search, 300) → debouncedSearch
  → useQuery(["trainers", organizationId])
      → client.members.list({ organizationId, role: "trainer" })
  → useQuery(["trainerProfiles", organizationId, memberIds])
      → Promise.allSettled(client.memberProfiles.get per member) → profilesMap
  → merge members + profiles → tableData (filtered by debouncedSearch)
  → columns: displayName, email, specialization, phone, status, actions (Edit / Suspend / Reactivate)
  → Sheet (create):
      → client.members.create({ role: "trainer", email, hierarchyScopeId })
      → client.memberProfiles.upsert(...)
  → Sheet (edit):
      → client.memberProfiles.upsert(...)
      → Collapsible: TrainerAvailabilityEditor
      → Collapsible: Category Buffer Times
          → useQuery(["trainerServices", organizationId, memberId]) [only when bufferSectionOpen]
              → client.serviceMembers.listForMember(...)
          → updateBufferMutation → client.serviceMembers.updateBuffer(...)
  → suspendMutation → client.members.suspend
  → reactivateMutation → client.members.reactivate
```

**Inputs:** Search input (debounced 300ms, client-side filter). Create form: email, hierarchyScopeId (from org hierarchy nodes dropdown), displayName, bio, specialization, phoneNumber, certifications (comma-separated). Edit form: all profile fields.
**State management:** `useState` for search, sheet open/close, editingMemberId, form values, collapsible section states, buffer editing state. TanStack Query for members list, profiles map (parallel fetch), trainer services.
**Outputs:** Table with search; Sheet with collapsible sections (Account, Profile, Weekly Availability, Category Buffer Times); suspend/reactivate action buttons.
**Side effects:** Invalidates `["trainers", organizationId]` and `["trainerProfiles", organizationId]` on member or profile mutations.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `members.list` — fetch trainers (role="trainer")
- `members.create` — add a new trainer
- `members.suspend` — suspend trainer account
- `members.reactivate` — reactivate trainer account
- `memberProfiles.get` — fetch profile per trainer (parallel)
- `memberProfiles.upsert` — create or update trainer profile
- `serviceMembers.listForMember` — list service/category assignments with buffer times
- `serviceMembers.updateBuffer` — update per-category buffer time override

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — copy email/phone
- `TrainerAvailabilityEditor` — `apps/web/src/components/trainers/trainer-availability-editor.tsx` — weekly schedule editor
- `Sheet`, `Collapsible` — `@/components/ui/sheet`, `@/components/ui/collapsible` — slide-in with expandable sections

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`, org hierarchy nodes
- `useDebounce` — `@/hooks/useDebounce` — debounced search
- `useQuery`, `useMutation`, `useQueryClient`
- `useState`

**Navigation: who navigates here:**
- App sidebar → "Trainers" link (`/dashboard/trainers/view`)

**Navigation: where it goes:** Stays on this page.

---

## 4. Data Shapes

**DB tables touched:**

| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `members` | SELECT | `id`, `userId`, `role`, `hierarchyScopeId`, `status`, `joinedAt`, `name`, `email` |
| `members` | INSERT | `organizationId`, `email`, `role="trainer"`, `hierarchyScopeId` |
| `members` | UPDATE | `status` (suspend/reactivate) |
| `member_profiles` | SELECT | `memberId`, `displayName`, `bio`, `specialization`, `phoneNumber`, `certifications` |
| `member_profiles` | UPSERT | all profile fields |
| `service_members` | SELECT | `memberId`, `categoryId`, `categoryName`, `bufferTimeMinutes`, `categoryDefaultBuffer` |
| `service_members` | UPDATE | `bufferTimeMinutes` |

**Key types:**
```ts
type TrainerRow = {
  id: string; userId: string; hierarchyScopeId: string;
  status: string; joinedAt: Date | string | null;
  name: string; email: string;
  displayName?: string | null; specialization?: string | null;
  phoneNumber?: string | null; bio?: string | null;
  certifications?: string[] | null;
};
```

---

## 5. Tests

**Test files:** None found.

**Not tested:** Any scenario. The route has no dedicated test file.

---

## 6. Notes

- `requirePermission("user_management:read")` in `beforeLoad` is a stub per project notes — it does not actually block access currently.
- Profiles are fetched in parallel via `Promise.allSettled`; failed profile fetches are silently ignored (the trainer row still appears with no profile data).
- Certifications are stored as an array in the DB but entered as a comma-separated string in the UI.
- The "Category Buffer Times" section only fetches `serviceMembers.listForMember` when `bufferSectionOpen` is true (lazy load).
- The "Weekly Availability" section is only shown when editing (not creating) a trainer.
- Hierarchy nodes for the scope dropdown come from `userContext.organizations[].hierarchy.nodes` — already fetched, no extra API call.
