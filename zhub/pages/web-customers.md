# Customers

**Route:** `/_authenticated/customers`
**File:** `apps/web/src/routes/_authenticated/customers.tsx:1`
**Platform:** web
**Auth required:** rbac(user_management:read)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Displays the current user's own customer profile and manages the list of customers (members with `role: "client"`) in the organization, with the ability to add new customers.

**Produces:** Two cards — (1) the logged-in user's own customer profile (phone, address, emergency contact, medical/general notes), (2) a searchable list of all client-role members with email-contact and schedule shortcuts.

**On success:**
- Profile card shows the user's profile details or a prompt to create one.
- Customer list shows all matching members with status badge.
- Adding a customer sends an invite and refreshes the list.
- Editing profile updates the profile and closes the dialog.

**On failure / error states:**
- Loading states: "Loading…" / "Loading customers…" text placeholders.
- No matches: "No customers match your search." / "No customers yet."
- Mutation errors: `toast.error(message)`.

---

## 2. How It Works

**Execution flow:**
```
CustomersComponent
  → useUserContext() — get organizationId, memberHierarchyScopeId
  → useQuery(["customer-profile", orgId])
      → client.customerProfiles.get({ organizationId })
          → POST /rpc/customerProfiles/get
  → useQuery: orpc.members.list.queryOptions({ role: "client" })
      → POST /rpc/members/list
  → useQuery: orpc.hierarchy.listNodes.queryOptions
      → POST /rpc/hierarchy/listNodes — for branch selector in add-customer dialog
  → upsertMutation → client.customerProfiles.upsert(...)
      → POST /rpc/customerProfiles/upsert
  → addCustomerMutation → client.members.create({ role: "client", ... })
      → POST /rpc/members/create
```

**Inputs:**
- `searchQuery` — local state string, filters customers by name/email client-side.
- "Add Customer" dialog: `newEmail` (string), `selectedBranchId` (optional UUID from hierarchy branch nodes).
- "Edit Profile" dialog: phone, address, emergencyContactName, emergencyContactPhone, medicalNotes, notes.

**State management:** Local `useState` for dialog open/close, form fields, search query. TanStack Query cache for server data.

**Outputs:** Profile card, customer list, two Dialog modals (edit profile, add customer).

**Side effects:**
- `client.members.create` creates a new member record (the user must already have an account).
- `client.customerProfiles.upsert` creates or updates the current user's profile.
- Cache invalidation on success: `["customer-profile", orgId]` and `orpc.members.list` query.
- "Contact" button: `window.location.href = mailto:…`
- "Schedule" button: navigates to `/dashboard/appointment/view`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `customerProfiles.get` — `POST /rpc/customerProfiles/get` — get current user's profile
- `customerProfiles.upsert` — `POST /rpc/customerProfiles/upsert` — create/update profile
- `members.list` (role: "client") — `POST /rpc/members/list` — list customer members
- `members.create` — `POST /rpc/members/create` — add a new customer by email
- `hierarchy.listNodes` — `POST /rpc/hierarchy/listNodes` — get branch nodes for selector

**Uses these components:**
- `Card`, `CardHeader`, `CardContent`, `CardTitle` — `@/components/ui/card`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter` — `@/components/ui/dialog`
- `Input`, `Label`, `Button`, `Badge`, `Select` — various `@/components/ui/` primitives
- `Search`, `Plus`, `Users`, `Mail`, `Calendar`, `User` — lucide-react icons

**Uses these hooks:**
- `useUserContext` — `@/hooks/useUserContext` — org context, member hierarchy scope
- `useQuery` (×3) — customer profile, members list, hierarchy nodes
- `useMutation` (×2) — upsertProfile, addCustomer
- `useQueryClient` — cache invalidation
- `useMemo` — client-side search filtering

**Navigation: who navigates here:**
- App sidebar links (not visible in sidebar config — this is the standalone `/customers` route, not the dashboard-nested one)

**Navigation: where it goes:**
- `/dashboard/appointment/view` — "Schedule" button per customer row

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `customer_profiles` | SELECT, INSERT/UPDATE | `phone`, `address`, `emergency_contact_name`, `emergency_contact_phone`, `medical_notes`, `notes` |
| `members` | SELECT, INSERT | `role = "client"`, `email`, `name`, `status`, `hierarchy_scope_id` |
| `hierarchy_nodes` | SELECT | `type = "branch"`, `id`, `name` |

**Form fields (Edit Profile dialog):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| phone | text | optional | `customerProfiles.phone` |
| address | text | optional | `customerProfiles.address` |
| emergencyContactName | text | optional | `customerProfiles.emergencyContactName` |
| emergencyContactPhone | text | optional | `customerProfiles.emergencyContactPhone` |
| medicalNotes | text | optional | `customerProfiles.medicalNotes` |
| notes | text | optional | `customerProfiles.notes` |

**Form fields (Add Customer dialog):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| email | email | required | `members.create.email` |
| branch | select (UUID) | optional | `members.create.hierarchyScopeId` |

---

## 5. Tests

**Test files:** None found.
**Scenarios covered:** N/A
**Not tested (risk areas):**
- `members.create` requires the user's email to already exist in the system — no validation or lookup before submission.
- Branch selector only shown when `branchNodes.length > 0`; if empty, falls back silently to `memberHierarchyScopeId`.
- "Contact" button uses `window.location.href` (mailto) — opens system email client, not a tracked action.

---

## 6. Notes

- "My profile" card shows the logged-in staff/admin's own customer profile (via `customerProfiles.get`), not a selected customer's profile. This conflates "my profile as a client" with "customer management" in one page.
- The route guard uses `requirePermission("user_management:read")` (string form, not object form) — both forms are supported by `route-guards.ts`.
- This standalone `/customers` route is separate from `/_authenticated/dashboard/_layout/customers/walk-in/view` which handles walk-in (unregistered) customers.
- Search filtering is entirely client-side — no debounce, no pagination; large customer lists will degrade.
