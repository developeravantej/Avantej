# Plan: Remove `/dashboard/packages/view` — Consolidate Package Catalog into Services

**Date:** 2026-04-15
**Author:** Planning session
**Status:** Phase 1 COMPLETE — Phases 2–4 remaining

---

## Progress Summary

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ DONE | Service form now submits all package fields |
| Phase 2 | 🔲 TODO | Add Sessions column to Services table |
| Phase 3 | 🔲 TODO | Delete Packages page + sidebar entry |
| Phase 4 | 🔲 TODO | Update zhub docs |

---

## 1. Overview

### Problem Statement
The web admin dashboard has a standalone **Packages** catalog page at `/dashboard/packages/view`. This page is a **filtered duplicate** of the Services page — it calls the exact same `client.services.list/create/update` endpoints with a client-side filter `sessionCount != null && sessionCount > 0`. The `services` schema already carries all package fields (`sessionCount`, `expirable`, `expiryDays`, `availablePaymentPlans`, `installmentIntervalDays`).

The main Services page (`/dashboard/service/view`) previously used a form (`service-form.tsx`) that explicitly refused to submit those fields. That has now been fixed (Phase 1 complete).

### Goals
1. Delete the redundant `/dashboard/packages/view` page and its sidebar entry.
2. ~~Extend `service-form.tsx`~~ **DONE** — form now submits all package fields.
3. Preserve `Package Instances` (`/dashboard/packages/instances/view`) and `Installments` — these are transactional records, not catalog entries.
4. Preserve the native app's customer-facing `buy-package/` and `packages/` screens — unchanged.

### Success Criteria
- `/dashboard/packages/view` returns 404.
- Service Form creates/updates services with `sessionCount`, `expiryDays`, `availablePaymentPlans`, `installmentIntervalDays` persisted in DB. ✅ Done.
- Services table shows a "Sessions" column so admins can identify session-based services.
- Sidebar shows Appointments → [Appointments, Class Slots, Package Instances, Installments] — no "Packages" entry.
- `Package Instances` and `Installments` pages continue to work exactly as before.

### Scope

**In Scope**
- ~~Update `apps/web/src/components/forms/service-form.tsx`~~ ✅ DONE
- ~~Update `apps/web/src/components/tables/service/view/data-table.tsx`~~ ✅ DONE
- Add "Sessions" column to `apps/web/src/components/tables/service/view/columns.tsx`
- Delete `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx`
- Update `apps/web/src/components/app-sidebar.tsx` (remove "Packages" link only)
- Delete `apps/web/src/__tests__/routes/packages.test.tsx`
- Regenerate `apps/web/src/routeTree.gen.ts` (automatic via dev server)
- Update `zhub/index.md` and delete `zhub/pages/web-dashboard-packages-view.md`

**Out of Scope**
- Backend schema/router changes (confirmed: already accepts all package fields)
- `packageInstances` table, `packageInstancesRouter`, Package Instances / Installments pages
- Native app's `buy-package/` flow or `packages/` screen
- Historic docs (`docs/INSTALLMENT_TESTING.md`, `docs/CUSTOMER_JOURNEY.md`, old `zplan/` entries)

---

## 2. Technical Architecture

### Current Data Flow (After Phase 1)

```
Admin creates any service (session-based OR one-shot)
 └─► /dashboard/service/view
      └─► "New Service" → ServiceFormDialog (extended ✅)
           └─► Fills: name, category, duration, max attendees, price, taxable,
                      sessions (sessionCount), expirable + expiry duration,
                      payment plans (full/half/quarterly), installment interval
           └─► client.services.create({ ..., sessionCount, expirable, expiryDays,
                                         availablePaymentPlans, installmentIntervalDays })

Admin wants to create a package (OLD flow — pending removal)
 └─► /dashboard/packages/view  ← still exists, being deleted in Phase 3
```

### Schema Changes
**None.** The `services` table already carries all fields:

```typescript
sessionCount: integer("session_count"),             // null = non-package service
expirable: boolean("expirable").default(false),
expiryDays: integer("expiry_days"),
availablePaymentPlans: text("available_payment_plans").array().default([]),
installmentIntervalDays: integer("installment_interval_days").default(30),
```

### API Contract Changes
**None.** `services.create` and `services.update` both accept all package fields. Verified.

---

## 3. User Journeys

### Journey A — Admin creates a session-based service ✅ NOW WORKS via Services page
**Trigger:** Admin wants to offer a "10-session Private Training" package.

1. Sidebar → Business → Services → View Services → `/dashboard/service/view`
2. Click "New Service" → `ServiceFormDialog` opens
3. Fill name, category, duration, max attendees, price, taxable
4. Set sessions count (e.g. 10), check "Expirable", set expiry duration
5. Check desired payment plans (Full / Half / Quarterly); set installment interval if needed
6. Submit → `client.services.create({ ..., sessionCount: 10, expirable: true, expiryDays: 90, availablePaymentPlans: ["full","half"], installmentIntervalDays: 30 })`
7. Dialog closes → service appears in list

### Journey B — Admin edits a package-type service ✅ NOW WORKS via Services page
1. Sidebar → Services → View Services
2. Find row (once Phase 2 adds a Sessions column, easily identifiable)
3. Click row → Detail dialog → Edit → `ServiceFormDialog` opens with all fields pre-filled (including sessions, expiry, payment plans)
4. Modify → Save → `client.services.update(...)`

### Journey C — Admin creates a non-package service (UNCHANGED)
Leave sessions at 0/blank, no payment plans → `sessionCount: null` in DB.

### Journey D — Admin views purchased packages (UNCHANGED)
`/dashboard/packages/instances/view` — completely unchanged.

### Journey E — Customer purchases package via native app (UNCHANGED)
Native `buy-package/` flow reads `service.sessionCount`, `service.expiryDays`, `service.availablePaymentPlans` to populate UI — these fields now have correct values. No code change needed.

---

## 4. Phased Implementation

### ✅ Phase 1 — Extend `ServiceFormDialog` with package fields
**Status: COMPLETE**

#### What was done

**`apps/web/src/components/forms/service-form.tsx`:**
- Added `availablePaymentPlans: Array<'full' | 'half' | 'quarterly'>` and `installmentIntervalDays: number` to `ServiceFormData` interface
- Added `toExpiryDays(duration, unit)` helper that converts form's duration+unit (day/week/month/year) → integer days for the API
- Wired all package fields in both `createMutation` and `updateMutation`:
  - `sessionCount: data.sessions > 0 ? data.sessions : null`
  - `expirable: data.expirable`
  - `expiryDays: data.expirable ? toExpiryDays(data.duration, data.duration_unit) : null`
  - `availablePaymentPlans: data.availablePaymentPlans.length > 0 ? data.availablePaymentPlans : undefined`
  - `installmentIntervalDays`: only when half/quarterly selected
- Added Payment Plans UI section (checkboxes for Full / Half / Quarterly + conditional installment interval input)
- Updated `useEffect` to populate `availablePaymentPlans` and `installmentIntervalDays` from `initialData`
- Fixed `ServiceFormDialogProps.initialData.id` type from `number` to `string` (UUIDs)

**`apps/web/src/components/tables/service/view/data-table.tsx`:**
- Fixed `editInitialData` to reverse-map `expiryDays` → `duration` + `duration_unit` (year/month/week/day) when loading a service for editing
- Added `availablePaymentPlans` and `installmentIntervalDays` to the edit initial data
- Fixed `id` to pass as UUID string (was `Number(editServiceData.id) || 0`, now `editServiceData.id`)

#### What Phase 1 did NOT do (intentional scope decisions)
- Did **not** add a `type` (private/semi_private/both) field — left for a separate service enhancement if needed
- Did **not** replace `duration`/`duration_unit` expiry UI with a none/days/date mode select — the existing expirable checkbox + duration fields are sufficient; restructuring the expiry UX is a separate task
- Did **not** add an `isSessionPackage` toggle — the sessions field naturally serves this purpose (0 or blank = not a package)

---

### 🔲 Phase 2 — Add Sessions column to Services table
**Status: TODO**
**Goal:** Admins can identify session-based services at a glance without opening each one.
**Dependency:** None (can ship before or after Phase 3).

#### Task 2.1 — Add "Sessions" column
**File:** `apps/web/src/components/tables/service/view/columns.tsx`

Add a "Sessions" column after the Price column:
```typescript
{
  accessorKey: "sessionCount",
  header: "Sessions",
  cell: ({ row }) => {
    const count = row.getValue("sessionCount") as number | null;
    return count != null ? count : "—";
  },
},
```

**Acceptance:**
- Services list shows a Sessions column
- Session-based services show their count; regular services show "—"

**Files modified:** `apps/web/src/components/tables/service/view/columns.tsx`

---

### 🔲 Phase 3 — Remove Packages page and sidebar entry
**Status: TODO**
**MUST deploy AFTER Phase 1 is verified working** — otherwise admins lose the ability to manage packages.

#### Task 3.1 — Remove "Packages" nav item from sidebar
**File:** `apps/web/src/components/app-sidebar.tsx` (find the Packages nav entry)

Delete exactly this line:
```typescript
{ title: "Packages", url: "/dashboard/packages/view", icon: Package },
```
**Do not touch** the Package Instances and Installments lines immediately after. They stay.

If after removing that line the `Package` icon import becomes unused, remove it from the import.

#### Task 3.2 — Delete the route file
**Delete:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx`

#### Task 3.3 — Delete the route's tests
**Delete:** `apps/web/src/__tests__/routes/packages.test.tsx`

This file tests `PackagesViewPage` which no longer exists — its `beforeAll` would crash at import time.

#### Task 3.4 — Regenerate route tree
**File:** `apps/web/src/routeTree.gen.ts` (auto-generated)

Start dev server (`bun dev:web`) — TanStack Router's Vite plugin regenerates the file automatically. Do **not** hand-edit. Verify all `AuthenticatedDashboardLayoutPackagesViewRoute` references are gone.

**Acceptance:**
- Dev server starts without TypeScript errors
- `/dashboard/packages/view` renders the app's 404/not-found page
- Sidebar: no "Packages" entry; Package Instances and Installments still present
- `/dashboard/packages/instances/view` still loads
- `/dashboard/packages/installments/view` still loads

**Files modified:** `apps/web/src/components/app-sidebar.tsx`, `apps/web/src/routeTree.gen.ts` (auto)
**Files deleted:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx`, `apps/web/src/__tests__/routes/packages.test.tsx`

---

### 🔲 Phase 4 — Update `zhub/` documentation
**Status: TODO**
**Dependency:** None (ship last; purely docs).

#### Task 4.1 — Remove Packages row from `zhub/index.md`
**File:** `zhub/index.md`
Delete the row referencing `/dashboard/packages/view`. Keep Package Instances and Installments rows.

#### Task 4.2 — Delete the deprecated hub page
**Delete:** `zhub/pages/web-dashboard-packages-view.md`

#### Task 4.3 — Update Services hub page
**File:** `zhub/pages/web-dashboard-service-view.md` (if it exists)
Note that session packages are now created and edited from this page.

---

## 5. Impact & Breakage Analysis

### Code references to `/dashboard/packages/view`

| File | Action |
|------|--------|
| `apps/web/src/routeTree.gen.ts` | Auto-regenerated (Task 3.4) |
| `apps/web/src/components/app-sidebar.tsx` | Delete one line (Task 3.1) |
| `apps/web/src/routes/.../packages/view.tsx` | Delete file (Task 3.2) |
| `apps/web/src/__tests__/routes/packages.test.tsx` | Delete file (Task 3.3) |
| `zhub/index.md` | Delete row (Task 4.1) |
| `zhub/pages/web-dashboard-packages-view.md` | Delete file (Task 4.2) |
| `zplan/*/plan.md` files | Historical records — no action |
| `docs/INSTALLMENT_TESTING.md` | Flag for next doc sweep — not blocking |
| `apps/native/app/(app)/dashboard/**` | All reference the **native** `/dashboard/packages` Expo route — not the web admin page. No action. |

### Deployment order
1. Phase 1 ✅ (merged)
2. Phase 2 (can go anytime — additive column)
3. Phase 3 (delete the old page — safe now that Phase 1 is done)
4. Phase 4 (docs — ship last)

Phases 2 and 3 can be combined into one PR. Phase 4 can be a separate docs-only PR.

### Nullable fields
- `services.sessionCount`: nullable — submit `null` when sessions = 0. ✅ Handled in Phase 1.
- `services.availablePaymentPlans`: `text[]` default `[]` — submit `undefined` when empty (API skips the field). ✅ Handled.
- `services.expiryDays` / `services.expirable`: submit `null` / `false` when expirable unchecked. ✅ Handled.

---

## 6. Cross-Cutting Concerns

### Error Handling
- Form validation: sessions ≥ 1 when entered, expiry days ≥ 1 when expirable is checked, installment interval ≥ 1 when half/quarterly selected.
- Mutation errors toast via existing `onError` handlers — no new plumbing needed.

### Testing
- **Phase 1 manual verification needed:** Start dev, create a service with sessions + expiry + payment plan, confirm values in DB via Drizzle Studio.
- **Delete** `apps/web/src/__tests__/routes/packages.test.tsx` in Phase 3.
- No new unit tests required for Phase 2 (column is pure display).

### Manual Smoke Test (Phase 3)
1. `bun dev` from project root
2. Log in as `developer.avantej@gmail.com` / `password1234`
3. `/dashboard/service/view` → Add Service → set sessions + expiry + half payment plan → save → verify row and DB
4. Click that service row → Edit → verify all fields pre-filled
5. Save without changes → verify no data loss
6. `/dashboard/packages/view` → should 404
7. `/dashboard/packages/instances/view` → should still load
8. `/dashboard/packages/installments/view` → should still load

### Rollback Strategy
Git revert phases in reverse order. No DB state to reverse.

---

## 7. Open Questions / Risks

### Resolved (no longer open)
- ~~`services.update` schema acceptance of package fields~~ ✅ Confirmed — both create and update accept all fields.
- ~~Native app dependency on web admin route~~ ✅ Confirmed native routes are in Expo Router, separate from web admin.
- ~~Whether service-form.tsx's `duration_unit` dropdown conflicts with the API~~ ✅ Resolved: `duration_unit` is now used for expiry duration (day/week/month/year → converted to `expiryDays` integer). Session duration uses a separate `sessionDurationMinutes` field that maps to `durationUnitType: "minutes"`.

### Open
1. **"Sessions only" filter tab on Services table:** The old Packages page had status tabs (active/archived/all). The Services table currently has none. Low priority — the Sessions column from Phase 2 enables basic visual identification. Add a filter tab in a follow-up if needed.
2. **`type` field (private/semi_private/both):** The Packages page had a service type selector. The Service form does not yet. If needed, add it as a follow-up after Phase 3.

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `routeTree.gen.ts` regeneration fails | Low | Run `bun dev:web` locally before merging |
| Hidden importers of `PackagesViewPage` | Low | Re-grep `PackagesViewPage\|packages/view` before Phase 3 |
| Native reviewers confused by `/dashboard/packages` path | Medium | Add PR note clarifying native vs. web route namespaces |
