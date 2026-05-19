# Customer 360 (Detail)

**Route:** `/dashboard/customers/$id`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/customers/$id.tsx`
**Platform:** web
**Auth required:** rbac(customer_management:read)
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Full customer profile view showing overview, packages, payments, and appointment history in a 360-degree layout — plus lead-source attribution, household linkage, and a membership-freeze action.

**Produces:** A multi-section profile page:
- Header (avatar, name, email, phone, status badge, joined date, **Pause Membership** action when eligible)
- **Lead Source** section (source / referrer / campaign) with edit dialog
- **Household** section (current household + members, attach / create / detach)
- KPI strip: LTV (placeholder), outstanding balance, active packages, appointments
- Four tabs: Overview, Packages, Payments, Appointments

**On success:** All sections load; freeze, attribution, and household mutations invalidate the detail query and re-render in place.

**On failure / error states:**
- Loading → `PageSkeleton`
- No org → "Select an organization to view this customer"
- No permission → destructive alert
- Invalid UUID → "Invalid customer link" + back button
- Not found (NOT_FOUND/404) → "Customer not found"
- Other API error → "Failed to load customer profile" + back button

---

## 2. How It Works

**Execution flow:**
1. Read `id` URL param; validate against UUID regex (early-exit with alert if malformed).
2. Read `organizationId` + permissions (`customer_management:read` for view, `customer_management:update` for freeze/edit).
3. `useQuery` on `["customerDirectory", "detail", organizationId, id]` → `client.customerDirectory.getById`. Retry skips NOT_FOUND / FORBIDDEN; stale 60s.
4. Two parallel `useQuery`s for upcoming (status="confirmed", limit 3) and all (limit 50) appointments via `client.appointments.list`, keyed on `member.userId`.
5. Compute derived: `activePackageCount`, `initials`.
6. Render header + `LeadSourceSection` + `HouseholdSection` + KPI strip + tabs.
7. `FreezeMembershipDialog` is mounted but hidden, toggled by header action.

**Inputs:**
- URL param `id` (UUID)
- User context: `currentOrganizationId`, `customer_management:read|update`

**State management:**
- TanStack Query keys: `["customerDirectory", "detail", orgId, id]`, `["appointments", "upcoming"|"all", orgId, userId]`, `["households", "get"|"list", ...]`, `["leadSources", orgId]`
- Local: `freezeOpen` boolean. All section-level edit dialogs own their own local form state.

**Outputs / mutations (triggered by feature components):**
- `client.memberships.freeze` (FreezeMembershipDialog) — invalidates `customerDirectory.detail`
- `client.customerProfiles.upsertForCustomer` (LeadSourceSection)
- `client.households.create | addMember | removeMember` (HouseholdSection)

**Side effects:** All mutations invalidate `["customerDirectory", "detail", organizationId]` (and `["households"]` for household ops).

---

## 3. What Depends On It

**Calls these API endpoints (direct on this page):**
- `client.customerDirectory.getById({ organizationId, memberId })`
- `client.appointments.list({ organizationId, clientUserId, status?, limit })`

**API endpoints used by mounted feature components:**
- `client.memberships.freeze` (FreezeMembershipDialog)
- `client.customerProfiles.upsertForCustomer`, `client.customerProfiles.listLeadSources` (LeadSourceSection)
- `client.households.get | list | create | addMember | removeMember` (HouseholdSection)

**Uses these components (refactored into `features/customers-detail/components/`):**
- `OverviewTab` — recent payments + upcoming appointments cards
- `PaymentsTab` — payments table
- `AppointmentsTab` — appointments table
- `KpiCard` — single KPI tile
- `PageSkeleton` — loading skeleton
- `LeadSourceSection` — source/referrer/campaign card + edit dialog
- `HouseholdSection` — household card + attach/create/detach dialogs
- `FreezeMembershipDialog` — pause-membership form
- `PackageRow` @ `@/components/customers/customer-360/package-row` (unchanged)

**Shared utils:** `getInitials`, `formatDate`, `formatDateTime`, `todayIso`, `memberStatusVariant`, `appointmentStatusVariant`, `paymentStatusVariant` — all in `features/customers-detail/utils.ts`.

**Shared types:** `FreezeFormState`, `LeadSourceProfileShape`, `HouseholdProfileShape` — in `features/customers-detail/types.ts`.

**Hooks:** `useQuery`, `useMutation`, `useQueryClient`, `useUserContext`, `useState`.

**Navigation in:** From `/dashboard/customers/view?tab=registered` (customer list).
**Navigation out:** Back button → `/dashboard/customers/view?tab=registered`.

---

## 4. Data Shapes

**DB tables touched (via backend services):**
- `members`, `customer_profiles`, `customer_packages`, `package_installments`, `payments`, `appointments` (tenantDb)
- `households`, `household_members` (tenantDb) — household linking
- `lead_sources` (tenantDb) — attribution
- `package_freezes` (tenantDb) — membership pauses
- `users` (controlPanelDb) — implicit

**Key types:**
```typescript
type FreezeFormState = {
  packageInstanceId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  reason: "medical" | "travel" | "other";
  feeWaived: boolean;
  notes: string;
};

type LeadSourceProfileShape = {
  leadSourceId?: string | null;
  referrerMemberId?: string | null;
  campaignId?: string | null;
} | null;

type HouseholdProfileShape = {
  id?: string | null;
  householdId?: string | null;
} | null;
```

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Freeze validation (end date > start date, eligible package filter)
- Lead source attribution edge cases (empty strings → null normalization)
- Household create-then-attach-as-non-primary path (two sequential mutations)
- Invalid UUID early-exit guard
- Permission downgrade mid-session (canFreeze flips false)

---

## 6. Notes

- **Refactored 2026-05-12 (Web Debt Cleanup, Phase 1):** Page split from a ~566-line monolith into the `apps/web/src/features/customers-detail/` feature folder with one component per section. Route file is now ~350 lines, mostly orchestration.
- **Sibling component `customer-profile-panel.tsx`** still embeds an older copy of the page (used by the v2 split-pane view at `/dashboard/customers/view`). It duplicates the formatting helpers — not yet migrated to the feature-folder utils.
- **Freeze gate:** "Pause Membership" button only shows when `canFreeze` AND at least one package is not already paused. The eligible-packages filter is enforced again inside the dialog.
- **Household:** create dialog supports "make this customer primary" toggle; when off, a follow-up `addMember` is issued so the new household isn't empty for this customer.
- **Lead source:** empty form values are normalized to `null` before sending to `customerProfiles.upsertForCustomer`.
- **Smart retry:** detail query skips retries on NOT_FOUND/FORBIDDEN — avoids hammering the API for missing/unauthorized records.
- **Outstanding balance** formatted via `formatPrice(cents, "MYR")`, red when > 0.
