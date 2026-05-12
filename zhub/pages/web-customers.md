# Customers

**Route:** `/_authenticated/customers`
**File:** `apps/web/src/routes/_authenticated/customers.tsx:1`
**Platform:** web
**Auth required:** rbac(user_management:read)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Lets a user view and search the customer list (members with role "client"), manage their own customer profile, and add new customers to the organization.
**Produces:** Three sections: (1) "My profile" card with current user's customer profile, (2) searchable customer grid showing all clients with contact/schedule actions, (3) "Add Customer" dialog, (4) "Edit profile" dialog.
**On success:** Customer list, hierarchy nodes, and own profile all load. Customers are filterable by name/email.
**On failure / error states:** Per-section loading states ("Loading customers…", "Loading…"). Empty states for no results / no matches. Toast errors for mutation failures.

---

## 2. How It Works

**Execution flow:**
```
CustomersComponent
  → useUserContext() → organizationId, memberHierarchyScopeId
  → useQuery(["customer-profile", orgId])
    → client.customerProfiles.get({ organizationId })
      → customerProfilesRouter.get
        → getCustomerProfile(tenantDb, session.user.id)
          → tenant DB: customer_profiles (by session userId)
  → useQuery via orpc.members.list.queryOptions({ role: "client" })
    → memberRouter.list → tenant DB: members + auth.user
  → useQuery via orpc.hierarchy.listNodes.queryOptions
    → filtered to type="branch" for branch selector in Add dialog
  → useMemo: filteredCustomers (client-side text search on name/email)
  → upsertMutation: client.customerProfiles.upsert(...)
      → customerProfilesRouter.upsert
        → upsertCustomerProfile(tenantDb, { userId, ...fields })
  → addCustomerMutation: client.members.create({ email, role: "client", hierarchyScopeId })
      → memberRouter.create → createMember(tenantDb, { ... })
```

**Inputs:**
- Search: text input (client-side filter on name/email)
- Profile form: phone, address, emergencyContactName, emergencyContactPhone, medicalNotes, notes
- Add customer form: email (required), branchId (optional — falls back to `memberHierarchyScopeId`)

**State management:**
- TanStack Query: customer profile, members list (role:client), hierarchy nodes
- Local state: `searchQuery`, 6 profile dialog fields, `newEmail`, `selectedBranchId`, dialog open states
- `useQueryClient` for cache invalidation

**Outputs:** Customer profile card; filtered customer grid; success toasts; cache invalidations after mutations
**Side effects:**
- Profile upsert: invalidates `["customer-profile", organizationId]`
- Add customer: invalidates members list query

---

## 3. What Depends On It

**Calls these API endpoints:**
- `customerProfiles.get` — fetch own customer profile
- `customerProfiles.upsert` — create or update own profile
- `members.list` (role: "client") — list customers
- `members.create` — add a new client-role member
- `hierarchy.listNodes` — populate branch selector

**Uses these components:** Inline Shadcn UI only (Card, Badge, Dialog, Input, Select, Button) — no dedicated custom components

**Uses these hooks:**
- `useUserContext` — org ID and member hierarchy scope
- `useQuery`, `useMutation`, `useQueryClient`
- `useNavigate` — navigate to appointment view from customer row

**Navigation: who navigates here:**
- No sidebar link found for this standalone route (sidebar links to `/dashboard/customers/walk-in/view` instead)
- `requirePermission("user_management:read")` in `beforeLoad` using string form

**Navigation: where it goes:**
- "Schedule" button on each customer → `/dashboard/appointment/view`
- "Contact" button → `mailto:` link (opens email client)

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `customer_profiles` | SELECT, INSERT/UPDATE | `userId`, `phone`, `address`, `emergencyContactName`, `emergencyContactPhone`, `medicalNotes`, `notes` |
| `members` | SELECT, INSERT | `userId`, `role`, `status`, `hierarchyScopeId` |
| `user` (auth) | JOIN | `id`, `name`, `email` |
| `hierarchy_nodes` | SELECT | `id`, `name`, `type` |

**Form fields (Edit Profile dialog):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| phone | text | optional | `customer_profiles.phone` |
| address | text | optional | `customer_profiles.address` |
| emergencyContactName | text | optional | `customer_profiles.emergencyContactName` |
| emergencyContactPhone | text | optional | `customer_profiles.emergencyContactPhone` |
| medicalNotes | text | optional | `customer_profiles.medicalNotes` |
| notes | text | optional | `customer_profiles.notes` |

**Form fields (Add Customer dialog):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| email | email | required | `members.create.email` |
| branchId | select | optional | `members.create.hierarchyScopeId` |

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** `requirePermission` string vs object form inconsistency; "Add Customer" requires user to pre-exist in the system; branch fallback logic to `memberHierarchyScopeId`

---

## 6. Notes

- The `requirePermission` call in `beforeLoad` uses a string form: `requirePermission("user_management:read")` — the object form `{ resource, action }` is used elsewhere. The stub may only handle one form.
- Adding a customer via `members.create` requires the user to already have a platform account — there is no invitation email sent from this page.
- "My profile" shows the **currently logged-in user's** customer profile (scoped by `session.user.id`), not a selected customer's profile.
- This page is separate from walk-in customers at `/dashboard/customers/walk-in/view`, which handles unregistered customers.
- Customer search is entirely client-side — no server-side filtering on the members list.
- This standalone route appears to be an alternate entry point; the primary customers area is in the dashboard layout.
