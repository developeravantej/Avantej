# Documentation Patches — `zdocs/dashboard-functionality.md`

> Workstream shape: **ordered edit list** (not phased implementation).
> Output: one commit to `zdocs/dashboard-functionality.md`.
> Effort estimate: ~4–6 hours focused editing.
> No user journeys — this is content, not a feature.

---

## Prerequisites

Three audit docs from `03-audit-discovery.md` should be complete before edits #9, #10, #11 below. If they're not ready yet, skip those three and merge the rest first.

---

## Patch List

Each edit below lists: **where** in the doc to insert/modify, **what to write**, and the **source truth** to copy from.

### 1. Section 5 — Add subsection "5c. Create Appointment"

**Insert after:** Section 5b (Class Slots), before Section 6.

**Source truth:** `apps/web/src/components/calendar/add-appointment-modal.tsx` (~2,528 lines)

**Fields to enumerate:**
- Client source toggle (registered search vs. walk-in create)
- Service multi-select (filtered by category)
- Trainer assignment (gated by `serviceMembers` eligibility)
- Time slot picker (respects `trainerAvailability` + existing appointments + category buffer + per-service override)
- Room dropdown (populated by `client.rooms.list`)
- Credit deduction against active `packageInstances`
- Recurrence config: daily / weekly / monthly / custom + week position (1st/2nd/3rd/4th/last)
- Multi-day slot configuration
- Save → `client.appointments.create` with computed payload

**API calls to add to the section's table:**

| Procedure | Purpose |
|-----------|---------|
| `client.appointments.create` | Persist appointment |
| `client.rooms.list` | Room dropdown |
| `client.trainerAvailability.list` | Slot validation |
| `client.serviceMembers.listForMember` | Trainer eligibility |
| `client.packageInstances.listForClient` | Credit balance |
| `client.customerProfiles.get` | Registered client lookup |
| `client.walkInCustomers.list` | Walk-in client lookup |

**User flow block:** client select → service select → trainer select → slot pick (with recurrence option) → room assign → confirm → credits debit → calendar refreshes.

---

### 2. Section 4b — Expand Service Categories with a Config subsection

**Insert inside 4b, after the existing API table.**

**Source truth:**
- `components/forms/service-category-form.tsx` (~1,144 lines)
- `components/forms/service-category-detail-dialog.tsx`
- `packages/api/src/routers/service-category-config.ts`

**What to document:**
- `serviceCategoryConfig` router: `getByCategoryId`, `upsert`
- Buffer time default per category (root of the buffer cascade)
- Staff incentive structure (fixed vs variable)
- Conditional commission thresholds
- Staff pool percentage for revenue splitting
- Multiple staff weightage configurations
- Booking rules: advance notice, cancellation window, buffer time

**Buffer cascade resolution order (add as a boxed note):**
```
per-service member override (updateMyBuffer)
  → per-service admin override (updateBuffer)
    → category config default
      → zero
```

---

### 3. Section 20 (Common Patterns) — Replace RBAC subsection

**Remove:** the 3-row "Admin / Staff / Trainer" table.

**Replace with:** full Resource × Action × Scope model.

**Source truth:** `apps/web/src/lib/permissions.ts` (~410 lines), `EnhancedPermissionMatrix.tsx`

**Content to add:**

**Scope levels (8 total, least to most broad):**
```
own → team → organization → country → region → area → branch → null
```

**Resources** (sample, full list from `permissions.ts`): `user_management`, `role_management`, `hierarchy_management`, `service_management`, `appointment_management`, `purchase_order_management`, `walk_in_customer_management`, `promotion_management`, `tax_configuration`, `inventory_management`, `reports`, etc.

**Actions:** `read`, `create`, `update`, `delete`, `manage`

**Runtime enforcement:**
- Server: `requirePermission(tenantDb, member, resource, action)` in every router handler
- Server: hierarchy scoping via `accessibleNodeIds` computed per session
- Client: `useCommonPermissions()` hooks gate button rendering (see patch #7)
- Client: `apps/web/src/lib/route-config.ts` maps each route → required permission (see patch #8)

**Note:** the existing caveat about the stub `requirePermission` in `route-guards.ts` stays as-is — out of scope for this plan.

---

### 4. Section 20 (Common Patterns) — Add "Heavy Forms Field Inventory" subsection

**Insert after:** the UI Components Used table.

**Source truth:** each form file listed.

**Table to add:**

| Form | Location | Immutable-After-Create Fields | Notable Sections |
|------|----------|------------------------------|------------------|
| Appointment Create | `calendar/add-appointment-modal.tsx` | client, service, initial datetime | Recurrence, credit debit, room |
| Service Category | `forms/service-category-form.tsx` | name | Commissions, staff weightage, booking rules |
| Service | `forms/service-form.tsx` | scheduling type | Payment plans (dynamic `string[]` sourced from `installmentPlans.list`, not a hard-coded enum — see 2026-04-17 change), installment intervals, multi-attendee |
| Role | `forms/role-form.tsx` | name | Commission structure, incentive type |
| Branch Hierarchy | `forms/hierarchical-branch-form.tsx` | node path | 4-level cascading selects |
| Supplier | `forms/supplier-form.tsx` | — | Account, payment terms, barcode |
| Product | `forms/product-form.tsx` | sku | Category, UOM, pricing |
| Permission Matrix | `access-control/permission-matrix/EnhancedPermissionMatrix.tsx` | — | 4D matrix editor |
| Bulk Assignment | `access-control/mobile/BulkAssignmentSheet.tsx` | — | Add/remove/replace modes |

For each form, link to the file path as the field-level truth.

---

### 5. Section 20 (Common Patterns) — Add "Commission & Incentive System" subsection

**Insert after:** the Heavy Forms Field Inventory.

**Source truth:** synthesis across `service-category-form.tsx` + `role-form.tsx` + `packages/api/src/routers/commission-splits.ts`

**Content:**
- Commission attaches at two layers: service-category config (default) + role definition (per-role override)
- Types: `fixed` (flat amount per service) vs `variable` (percent of service price)
- Conditional thresholds: commission rate changes above/below revenue thresholds
- Staff pool percentage: portion of service revenue allocated to a shared pool
- Staff weightage: per-member share of the pool
- Calculated output → `commissionSplits` router (`getByAppointment`, `getMyCommissions`)
- No current UI for commission viewing — flag as Open Question (ref: `05-open-questions.md`)

---

### 6. Section 18 (Settings) — Add subsection "18e. Platform Admin Router (Backend-Only)"

**Insert at the end of Section 18.**

**Source truth:** `apps/server/src/routers/admin.ts`

**Content:**
- Procedures: `listTenants`, `getTenant`, `suspendTenant`, `unsuspendTenant`, `startImpersonation`, `exitImpersonation`, `getAuditLogs`, `getStats`
- Status: no UI built — backend-only
- Impersonation caveat: `startImpersonation` changes session context; tenant middleware then resolves the impersonated org's DB. Must be called only by platform admins.
- Link to `05-open-questions.md` for the "should we build a platform admin panel?" decision.

---

### 7. Section 20 (Common Patterns) — Add "Hooks Layer" subsection

**Insert at the end of Common Patterns.**

**Source truth:** `apps/web/src/hooks/*`

**Table:**

| Hook | File | Role |
|------|------|------|
| `useAuth` | `hooks/useAuth.ts` | Better-Auth session + org context |
| `useUserContext` | `hooks/useUserContext.ts` | Current org, memberships |
| `usePermissions` | `hooks/usePermissions.ts` | Raw permission list |
| `useCommonPermissions` | `hooks/usePermissions.ts` | Pre-built checkers: `canCreateX`, `canEditX`, etc. |
| `useIsSystemAdmin` | `hooks/usePermissions.ts` | System-admin gate |
| `useRoles` | `hooks/useRoles.ts` | Role data |
| `useUserAssignment` | `hooks/useUserAssignment.ts` | Role assignment mutations |
| `useProductForm` / `useProductData` | `hooks/useProductForm.ts`, `useProductData.ts` | Product-specific state |

**Convention to document:**
> Every mutation button (Create / Edit / Delete / Approve / Deactivate) MUST be gated by a `useCommonPermissions` checker. Navigation gating is advisory (see `requirePermission` caveat); button gating is the user-visible enforcement.

---

### 8. Section 20 (Common Patterns) — Add "Route → Permission Map" subsection

**Insert after:** the Hooks Layer subsection.

**Source truth:** `apps/web/src/lib/route-config.ts` (~214 lines)

**Content:**
- Reference this file as the single source of truth for route gating
- Example entries: `/dashboard/user/view → user_management:read`, `/dashboard/branch/view → hierarchy_management:read`
- Note: auto-generate a full table from this file in the docs; use a script comment.

---

### 9. Section 20 (Common Patterns) — Add "Pagination" subsection

**Depends on:** `03-audit-discovery.md` output doc `zdocs/pagination-audit.md`

**Insert after:** Data & State Management.

**Content:** summary of the audit doc + link to it.

---

### 10. Section 20 (Common Patterns) — Add "Error Handling Conventions" subsection

**Depends on:** `03-audit-discovery.md` output doc `zdocs/error-handling-conventions.md`

**Content:** per-pattern table (toast / silent-empty / error UI / retry) with examples, link to the full audit.

---

### 11. Known Issues Summary — Update Data Display Bugs

**Depends on:** `03-audit-discovery.md` output doc `zdocs/currency-defaults-audit.md`

**Update:**
- Existing Expenses "usd default" row → link to the audit
- Add any additional currency-default issues found in the audit

---

### 12. Rooms — Add new Section 5d or Section 12j

**Status:** Rooms UI shipped (see `zdone/17-04_rooms-management.md`). Doc patch is now a straight copy from `zhub/pages/web-dashboard-rooms-view.md`.

**Insert location:** under Section 5 (Appointments) since rooms are an appointment-scheduling resource, OR under Section 12 (Inventory) if the team prefers treating rooms as a facility resource. **Default:** Section 5 as `5d. Rooms`.

**Content to capture (matches shipped code, NOT the original plan):**
- Route `/dashboard/rooms/view` with optional `?returnTo=<path>` query param (triggers yellow banner for appointment-modal re-entry)
- Status tabs: Active / All / Inactive; DataTable columns: Name, Type, Branch, Capacity, Status, Actions
- Form lives inline in the page (NOT a separate `forms/room-form.tsx`); fields: Name, Type (5 options), Capacity, Branch (searchable combobox over `hierarchy.listNodes` filtered to branches), Active toggle (edit only)
- Row actions: Edit + Deactivate/Reactivate — both call `client.rooms.update({ isActive })`. No hard-delete in the UI (`rooms.delete` router proc internally soft-deletes)
- Known hazard: sidebar uses `appointment_management:read` but `rooms.ts` router enforces `appointments:{read,create,update}`. Admin works because it holds both; custom non-admin roles granted only `appointment_management:*` will see the link and fail at the API. Flag explicitly; cleanup deferred.
- Appointment modal cross-reference: when `rooms.length === 0`, the Area dropdown renders an inline "Create one →" link that closes the modal and navigates to `/dashboard/rooms/view?returnTo=/dashboard/appointment/view`. Employee select is disabled until a room is selected; placeholder is contextual. Multi-appointment mode intentionally unchanged.
- Seed: `apps/server/scripts/seed-business-data.ts` Step 7 provisions one "Main Room - {branch}" per branch, idempotent.

---

### 12b. Settings — Add subsection "Installment Plans" (out-of-plan work, shipped 2026-04-17)

**Status:** Shipped on branch `Customer-app`. See `zdone/17-04_dynamic-installment-plans.md`.

**Insert location:** inside Section 18 (Settings) alongside Tax Rates, Google Calendar, etc.

**Source truth:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/installment-plans.tsx`
- `packages/api/src/routers/installment-plans.ts`
- `packages/services/src/installment-plan.service.ts`
- `packages/db/src/schema/tenant/installment-plans.ts`

**Content to capture:**
- Route `/dashboard/settings/installment-plans`. No `beforeLoad` guard (matches `tax-rates.tsx`); permission enforced server-side via `service_management` resource.
- Schema `installment_plans`: `code` (unique, immutable after create), `name`, `numInstallments` (>= 1), `defaultIntervalDays`, `description`, `isActive`, `isDefault`, `sortOrder`.
- Seed on migration `0017_installment_plans`: `full` (default, 1 inst), `half` (2 inst), `quarterly` (4 inst).
- DataTable columns: Name, Code (mono badge), numInstallments, defaultIntervalDays, isDefault (star), isActive, Actions (Edit + Deactivate).
- Deactivate silently clears `isDefault` flag (tax-rates pattern); UI warns if plan is referenced by active services (soft warning, non-blocking).
- Cross-reference: Service form's "Available Payment Plans" checkbox list is now dynamic, driven by `client.installmentPlans.list({ activeOnly: true })`. Historical rows with orphan codes fall back to raw-code display.
- Cross-reference: Installments view gained filters (search / due-before / due-after / plan dropdown) via extended `installments.adminOverview`.
- Interval precedence at package-instance creation: `input.installmentIntervalDays ?? planRow.defaultIntervalDays ?? 30` (verified `packages/api/src/routers/package-instances.ts:221`). The `input.installmentIntervalDays` is the service-level override passed through from the caller; the plan default is the fallback.

---

### 13. Section 19 (Sidebar) — Update structure

After patches #6 and #12 land, update the sidebar tree:
- Add "Rooms" under the Appointments group (shipped — `DoorOpen` icon, between Class Slots and Package Instances, gated by `appointment_management:read`)
- Add "Installment Plans" under the Config group (shipped — `CreditCard` icon, between Tax Rates and Google Calendar; no explicit permission prop)
- Optionally note that the GHL link requires platform-admin permission after the security fix

---

### 14. Section 21 (Testing Status) — Add entries for Rooms and Installment Plans

Rooms UI shipped 2026-04-17 with type-check clean / lint clean / manual browser verification per `zdone/17-04_rooms-management.md`. No automated component tests. Add the row accordingly.

Installment Plans shipped 2026-04-17 with 21 unit + 11 integration tests for the service layer (`apps/server/src/tests/unit/services/installment-plan.test.ts`, `apps/server/src/tests/integration/installment-plans.integration.test.ts`). Frontend has no component tests. Add the row accordingly.

---

### 15. New Appendix — "Out of Dashboard Scope" (P3 #24)

**Insert:** at the very end of `dashboard-functionality.md`, after the Known Issues Summary.

**Content:** a brief one-paragraph appendix naming the non-dashboard routes that ship with the same web app, so the reader knows the dashboard is not the whole application:

- Public marketing: `/`, `/about`, `/features`, `/contact`, `/demo`
- Auth flows: `/(auth)/login`, `/(auth)/signup`, `/(auth)/setup-password`, `/verify-email`, `/accept-invitation`
- Authenticated non-dashboard: `/_authenticated/onboarding`, `/_authenticated/go-highlevel-integration` (and the parallel legacy routes — see `05-open-questions.md` Q2)
- Subscription: `/subscribe`

This is a one-line pointer per route — not a full documentation pass. Cross-reference the sibling doc (or mark as "out of scope for this reference") for each.

---

### 16. Section 20 (Common Patterns) — Add "Input Quality" subsection

**Depends on:** `03-audit-discovery.md` Audit 4 output doc `zdocs/uuid-inputs-audit.md`.

**Content:** summary of the UUID audit + link to it + the intended remediation order.

---

## Acceptance Criteria

- [ ] All 17 patches merged (16 original + #12b Installment Plans settings subsection)
- [ ] Cross-references between the primary doc and the three new audit docs work
- [ ] No broken internal anchors (markdown TOC passes link check)
- [ ] `dashboard-functionality-2.md` can be retired or reduced to a changelog pointer
