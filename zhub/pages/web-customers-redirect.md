# Customers

**Route:** `/customers`
**File:** `apps/web/src/routes/_authenticated/customers.tsx`
**Platform:** web
**Auth required:** `user_management:read`
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage customer (client) profiles and database. View customer list, add new customers, and manage customer profile (phone, address, emergency contact, medical notes, notes).

**Produces:** Two main sections: 
1. "My profile" card — logged-in user's customer profile (edit dialog)
2. "Customer Management" table — searchable list of customers with contact action buttons

**On success:** Customer list loads and renders in a grid. User can search by name/email, add customers, and edit their own customer profile.

**On failure / error states:** Loading spinners for customers and profile data; search result message if no matches.

---

## 2. How It Works

**Execution flow:**
1. Before load: Check `user_management:read` permission
2. On mount: Fetch organizationId from useUserContext
3. Load queries (parallel):
   - `client.customerProfiles.get({ organizationId })` → user's own customer profile
   - `orpc.members.list.queryOptions({ input: { organizationId, role: "client" } })` → all customers
   - `orpc.hierarchy.listNodes.queryOptions({ input: { organizationId } })` → fetch hierarchy for branch selector
4. Filter customers by search query (client-side, memoized)
5. Mutations:
   - Upsert profile: `client.customerProfiles.upsert()` with phone, address, emergency contact, medical notes, notes
   - Add customer: `client.members.create({ role: "client" })` with email and branch hierarchy scope

**Inputs:**
- Search box: string (client-side filtering)
- Profile edit dialog: phone, address, emergencyContactName, emergencyContactPhone, medicalNotes, notes
- Add customer dialog: newEmail, selectedBranchId

**State management:**
- TanStack Query:
  - `["customer-profile", organizationId]` — user's profile
  - `orpc.members.list` query (via orpc.members.list.queryOptions)
  - `orpc.hierarchy.listNodes` query
- Local state: searchQuery, isProfileDialogOpen, isAddCustomerOpen, form fields (phone, address, etc.)

**Outputs:** 
- Profile card with edit button
- Searchable customer grid with contact and schedule buttons
- Dialogs for editing profile and adding customers

**Side effects:** 
- Profile upsert: invalidate `["customer-profile", organizationId]`
- Add customer: invalidate `orpc.members.list.queryOptions()`
- Navigation: "Schedule" button navigates to `/dashboard/appointment/view`

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.customerProfiles.get({ organizationId })` — fetch logged-in user's customer profile
- `client.customerProfiles.upsert({ organizationId, phone, address, ... })` — save profile
- `orpc.members.list({ organizationId, role: "client" })` — fetch all customers
- `orpc.hierarchy.listNodes({ organizationId })` — fetch hierarchy nodes (for branch selector)
- `client.members.create({ organizationId, email, role: "client", hierarchyScopeId })` — add customer

**Uses these components:**
- `Card`, `CardContent`, `CardHeader`, `CardTitle` — profile card UI
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` — modals for edit/add
- `Button`, `Input`, `Label`, `Badge`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` — shadcn form elements
- lucide icons: `Plus`, `User`, `Mail`, `Calendar`, `Search`, `Users`

**Uses these hooks:**
- `useUserContext()` — fetch org ID and hierarchy
- `useQuery()` — TanStack Query
- `useMutation()` — mutations
- `useQueryClient()` — manual invalidation
- `useNavigate()` — navigate to appointment page
- `useMemo()` — filter customers by search

**Navigation: who navigates here:** `/customers` route

**Navigation: where it goes:** "Schedule" button → `/dashboard/appointment/view`

---

## 4. Data Shapes

**DB tables touched:**
- `tenantDb.customerProfiles` — read, upsert
- `controlPanelDb.members` — read, create (role: "client")
- `tenantDb.hierarchy` — read nodes

**Key types / Zod schemas:**
```typescript
type CustomerProfile = {
  phone?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  medicalNotes?: string | null;
  notes?: string | null;
};

type Customer = {
  id: string;
  name?: string | null;
  email?: string | null;
  status: "active" | string;
};

type HierarchyNode = {
  id: string;
  name: string;
  type: "branch" | string;
};
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Customer add with hierarchy scope selection
- Profile edit upsert (all field types)
- Search filtering (case-insensitivity, empty results)
- Branch selector visibility (only shown if branchNodes.length > 0)
- Navigation to appointment page
- Form validation (email required for add customer)

---

## 6. Notes

- **Multi-role members table:** customers are members with role "client" (like trainers have role "trainer")
- **Org-scoped profiles:** Customer profile is org-wide (one per logged-in user per org), not per-customer
- **Branch selector:** Only visible if organization has branch nodes in hierarchy; falls back to memberHierarchyScopeId
- **Contact button:** Uses `window.location.href = mailto:` to open email client
- **Schedule button:** Always available, navigates to appointment view (not customer-specific)
- **Search:** Memoized client-side filter on name and email; no server-side search
- **No LEGACY comment** — page appears to be actively maintained
- **No permission checks in mutations:** Assumes add/edit permissions inherited from `user_management:read` permission

