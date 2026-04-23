# Customer 360 (Detail)

**Route:** `/dashboard/customers/$id`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/customers/$id.tsx`
**Platform:** web
**Auth required:** rbac(customer_management:read)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Full customer profile view showing overview, packages with installments, payment history, and appointment history in a 360-degree view.

**Produces:** A multi-tabbed customer profile page with:
- Header with customer avatar, name, email, phone, status badge, and join date
- KPI strip: LTV (N/A placeholder), outstanding balance, active packages count, total appointments
- Four tabs: Overview, Packages, Payments, Appointments

**On success:** All data loads and tabs are interactive. Overview tab shows recent payments and upcoming appointments. Packages tab lists active packages with rows. Payments/Appointments tabs show full history in tables.

**On failure / error states:**
- Loading: Page skeleton shown
- No org: Card message "Select an organization to view this customer"
- No permission: Destructive alert "You don't have permission to view customer profiles"
- Not found: Alert + back button "Customer not found. They may have been removed"
- API error: Alert + back button "Failed to load customer profile. Please try again"

---

## 2. How It Works

**Execution flow:**
1. Route loads; extracts `id` URL param (customer/member ID)
2. Checks `organizationId` from user context (guard: no org → message)
3. Checks `canRead` permission (guard: no permission → alert)
4. Fetches customer detail via `client.customerDirectory.getById({ organizationId, memberId: id })`
   - Retry logic: no retry on NOT_FOUND/FORBIDDEN (404/403)
   - Stale time: 60s
5. Fetches upcoming appointments (status="confirmed", limit 3) via `client.appointments.list()`
6. Fetches all appointments (limit 50) via `client.appointments.list()` (no status filter)
7. Maps data to display formats (resolved names, formatted prices/dates)
8. Renders profile header with resolved person-in-charge info
9. Renders KPI strip (outstanding balance as MYR, active package count, appointment count)
10. Renders tabs with detail tables/cards

**Inputs:**
- URL param: `id` — customer/member ID
- User context: organizationId, canRead permission

**State management:**
- TanStack Query: `["customerDirectory", "detail", organizationId, id]`, `["appointments", "upcoming", ...]`, `["appointments", "all", ...]`
- Local state: none (pure data presentation)
- Derived state: `activePackageCount`, `initials` (from name)

**Outputs:**
- Renders: profile header, KPI cards, tabbed interface with tables
- No mutations

**Side effects:**
- Queries enabled only when organizationId is valid and user has read permission
- No cache invalidation

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.customerDirectory.getById({ organizationId, memberId })` — fetch full customer profile with packages, payments, metadata
- `client.appointments.list({ organizationId, clientUserId, status, limit })` — fetch appointments

**Uses these components:**
- `PackageRow` — `@/components/customers/customer-360/package-row` — renders individual package with installments
- `Alert`, `AlertDescription` — shadcn/ui alert
- `Badge` — shadcn/ui badge with variants
- `Button` — shadcn/ui button
- `Card`, `CardHeader`, `CardTitle`, `CardContent` — shadcn/ui card
- `Skeleton` — shadcn/ui skeleton loader
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` — shadcn/ui tabs

**Uses these hooks:**
- `useQuery()` — fetch detail, upcoming appointments, all appointments
- `useUserContext()` — get organizationId, check permission

**Navigation: who navigates here:**
- From `/dashboard/customers/view` (customers list page, likely)
- Via Link: `/dashboard/customers/view?tab=registered`

**Navigation: where it goes:**
- Back button navigates to `/dashboard/customers/view?tab=registered`
- No forward navigation

---

## 4. Data Shapes

**DB tables touched:**
- `customers` (tenantDb) — user, profile, contact info
- `customer_packages` (tenantDb) — package instances with status
- `package_installments` (tenantDb) — installment schedule
- `payments` (tenantDb) — payment history
- `appointments` (tenantDb) — appointment history
- `users` (controlPanelDb) — implicit, for user data

**Key types / Zod schemas:**
```typescript
type CustomerDetail = {
  member: { status: string; userId: string; joinedAt: Date };
  user: { name: string; email: string };
  profile: { phone?: string };
  packageInstances: Array<{ id: string; status: string }>;
  recentPayments: Array<{
    id: string;
    totalAmount: number;
    createdAt: Date;
    paymentMethod?: string;
    status: string;
  }>;
  appointmentCount: number;
  outstandingBalanceCents: number;
};

type Appointment = {
  id: string;
  startTime: Date;
  status: string;
  serviceName?: string;
};
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Permission check and guard logic
- Customer not found vs. API error differentiation (404 vs. other errors)
- Null/undefined handling in profile fields (phone, profile data, etc.)
- Date/price formatting edge cases
- Package installment rendering (`PackageRow` component not examined)
- Concurrent requests and race conditions
- Tab switching and data stale time management

---

## 6. Notes

- **Large file (566 lines):** Complex multi-tab page with detailed data shapes and conditional rendering
- **Retry logic:** Smart retry — skips retry on NOT_FOUND/FORBIDDEN to avoid unnecessary retries on auth/permission errors
- **Derived display values:** Computes `activePackageCount` (filtered by status), `initials` for avatar
- **Member status variants:** Maps status ("active", "inactive", etc.) to badge variants; likewise for appointments and payments
- **Outstanding balance formatting:** Uses `formatPrice(cents, "MYR")` and applies red color if > 0
- **Back navigation:** Uses `search={{ tab: "registered" }}` to preserve tab state in customer list
- **Guard order:** Checks org first, then permission, then loading state — prevents rendering if any guard fails
- **Appointments tab:** Shows service name, date, time, status; status has destructive styling for cancelled/no-show
