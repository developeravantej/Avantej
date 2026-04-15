# Phase 5: Manual UI smoke test

**Goal:** Walk through every user-facing flow affected by the consolidation against the freshly migrated dev database. This is the final gate before merge — it catches anything that slipped past the type checker and test suites (stale copy, wrong field bindings, missing invalidations, CSS regressions from rewired forms).

**User journeys this phase delivers:** All 5 of the journeys below, completed end-to-end.

**Dependencies:** Phases 1–4 complete. Dev server (`bun dev`) running. Logged in as the test admin (`franchisee@gmail.com` / `password123` per `memory/MEMORY.md`).

---

## How to use this document

For each journey below:
1. Perform the steps exactly as written.
2. Watch the browser devtools Network tab for failed requests.
3. Watch the browser devtools Console tab for warnings/errors.
4. Watch the terminal running `bun dev:server` for errors.
5. Check a box next to each journey as it completes. If anything fails, stop and file it against the appropriate phase.

---

## Journey 1: Admin manages "Packages" (services with sessionCount > 0)

**Where it lives:** `/dashboard/packages/view` — a filtered view of `services` where `sessionCount > 0`.

### 1a: List packages
- [ ] Navigate to `/dashboard/packages/view`
- [ ] Table loads with a header row ("Active / Archived / All" tabs)
- [ ] "Active" tab shows rows for every service with `sessionCount > 0` and `isActive = true`
- [ ] Each row shows: name, session count, other columns
- [ ] Network tab: `POST /rpc/services/list` returned 200
- [ ] Network tab: response includes `sessionCount`, `expirable`, `expiryDays` fields

### 1b: Create a new package
- [ ] Click "+ New Package" (or equivalent)
- [ ] Dialog opens inline
- [ ] Fill in: name ("Smoke Test Pack"), session count (10), duration (60 min), max attendees (1)
- [ ] Toggle "Expirable" on, set expiry days to 90
- [ ] Click "Create"
- [ ] Dialog closes on success, toast confirms
- [ ] Table auto-refreshes, new row appears at the top
- [ ] Network: `POST /rpc/services/create` 200, request body includes `sessionCount: 10, expirable: true, expiryDays: 90`

### 1c: Edit the new package
- [ ] Click the row from 1b
- [ ] Edit dialog opens with pre-filled values
- [ ] Change name to "Smoke Test Pack (Edited)"
- [ ] Click "Save"
- [ ] Toast confirms, table shows new name
- [ ] Network: `POST /rpc/services/update` 200

### 1d: Archive the new package
- [ ] Click the archive button on the "Smoke Test Pack (Edited)" row
- [ ] Confirmation dialog shows
- [ ] Click "Archive"
- [ ] Row disappears from "Active" tab
- [ ] Click "Archived" tab, row appears there
- [ ] Network: `POST /rpc/services/update` with `isActive: false` → 200

---

## Journey 2: Admin manages package instances

**Where it lives:** `/dashboard/packages/instances/view`

### 2a: List instances (THE BUG FIX)
- [ ] Navigate to `/dashboard/packages/instances/view`
- [ ] **Critical:** The page does NOT crash. No red error boundary, no blank white screen.
- [ ] Table loads with columns: Service, Client ID, Credits, Status, etc.
- [ ] The "Service" column shows a human-readable name (e.g. "Smoke Test Pack") — NOT a truncated UUID
- [ ] If no instances exist, table shows empty state
- [ ] Network: `POST /rpc/packageInstances/listAll` 200
- [ ] Network: `POST /rpc/services/list` 200 (for the name mapping)
- [ ] Console: no errors

### 2b: Create an instance for the test pack
- [ ] Click "+ Assign Package"
- [ ] Dialog opens inline
- [ ] In the "Package" dropdown, select a package (e.g. "Smoke Test Pack" if you didn't archive it, or another one)
- [ ] Enter a client ID (a member's user ID — grab one from the members page or use the seed data)
- [ ] Credits total: 10
- [ ] Starts: today
- [ ] Expires: today + 90 days
- [ ] Click "Create"
- [ ] Toast confirms, dialog closes, new row appears
- [ ] Network: `POST /rpc/packageInstances/create` 200, request body includes `serviceId: <uuid>` (not `packageId`)
- [ ] The new row in the table shows the package name, not a UUID

### 2c: Edge case — old instances (pre-migration)
- [ ] If the migration script backfilled any pre-existing instances, they should appear in the table with the correct service name (from the name lookup)
- [ ] If any row shows a fallback truncated UUID in the "Service" column, that means `serviceNameById.get(item.serviceId)` returned undefined → investigate whether that row's `serviceId` points at an archived or deleted service

---

## Journey 3: Admin views cancelled sales

**Where it lives:** `/dashboard/cancelled-sales/view`

### 3a: List cancelled sales orders
- [ ] Navigate to `/dashboard/cancelled-sales/view`
- [ ] Table loads. If no cancelled sales exist, shows empty state.
- [ ] Each row (if any) shows: cancellation number, cancellation date, customer, refund amount
- [ ] Network: `POST /rpc/cancelledSales/list` 200
- [ ] Response shape matches the old contract (the cancelled-sales router is now an alias over `sales_orders WHERE status='cancelled'`)

### 3b: Create a cancellation (requires existing sales order)
- [ ] Navigate to `/dashboard/sales/<id>` for any completed sales order
- [ ] Click "Cancel this order" (or equivalent)
- [ ] Confirmation dialog, enter reason, confirm
- [ ] Toast confirms
- [ ] Navigate back to `/dashboard/cancelled-sales/view`
- [ ] The newly-cancelled order appears in the list
- [ ] Its `cancellationNumber` starts with `CAN-<YYYYMMDD>-`
- [ ] Its `cancellationDate` is today
- [ ] Network: `POST /rpc/salesOrders/cancel` (or whatever the exact procedure name is) 200

---

## Journey 4: Admin creates/edits a service category with commission config

**Where it lives:** Service categories data table — route depends on your sidebar. Check `apps/web/src/routes/**/services/categories*` or similar.

### 4a: Open the category form
- [ ] Navigate to the service categories page
- [ ] Click "+ New Category"
- [ ] The **real** 17-field form opens (this is the fix — it used to be a 4-field stub)
- [ ] Confirm the form has: name, duration, max attendees, commission config (type, staff weightage, payment structures), booking rules (advance booking, cancellation window)

### 4b: Create a category with commission config
- [ ] Enter name: "Smoke Test Category"
- [ ] Duration: 60
- [ ] Max attendees: 1
- [ ] Commission type: fixed
- [ ] Staff weightage: add one entry, position 1, percentage 100, title "Lead"
- [ ] Payment structure: any plausible value
- [ ] Booking rules: require 24h advance booking, allow cancellation up to 4h before
- [ ] Click "Save"
- [ ] Toast confirms
- [ ] Network: `POST /rpc/serviceCategories/create` 200 (creates the category row)
- [ ] Network: `POST /rpc/serviceCategoryConfig/upsert` 200 (writes the 1:1 config row)
- [ ] Neither `serviceRules` nor `serviceCommissionConfig` routers are called (those were deleted)
- [ ] New category row appears in the table

### 4c: Edit the category
- [ ] Click the row
- [ ] Form re-opens, pre-filled
- [ ] Confirm the pre-fill pulls both from `serviceCategories.getById` AND `serviceCategoryConfig.getByCategoryId`
- [ ] Change max advance hours to 48
- [ ] Save
- [ ] Network: `serviceCategories.update` + `serviceCategoryConfig.upsert` both 200

---

## Journey 5: Admin creates/edits a service with package fields

**Where it lives:** Services data table — `/dashboard/services/view` (or similar).

### 5a: Open the service form
- [ ] Navigate to the services page
- [ ] Click "+ New Service"
- [ ] The **real** 14-field form opens (was an 8-field stub before)
- [ ] Confirm it has: name, category, duration, max attendees, type (private/semi/both), tax, price, **expirable**, **sessionCount**, **expiryDays**

### 5b: Create a service with the new fields
- [ ] Name: "Smoke Test Service"
- [ ] Category: select the "Smoke Test Category" from Journey 4
- [ ] Duration: 60 minutes
- [ ] Max attendees: 1
- [ ] Type: `both` (NEW enum value — this is one of the consolidation additions)
- [ ] Session count: 5
- [ ] Expirable: on, expiry days: 60
- [ ] Price: 1000
- [ ] Save
- [ ] Toast confirms, row appears
- [ ] Network: `POST /rpc/services/create` 200 with `type: "both"`, `sessionCount: 5`, `expirable: true`, `expiryDays: 60`

### 5c: Edit the service
- [ ] Click the row
- [ ] Form pre-filled with everything including the new fields
- [ ] Change session count to 10
- [ ] Save
- [ ] Network: `POST /rpc/services/update` 200

### 5d: Verify the "Smoke Test Service" shows up under Packages too
- [ ] Navigate to `/dashboard/packages/view` (from Journey 1)
- [ ] "Smoke Test Service" row is visible (because sessionCount > 0)
- [ ] This confirms the "packages are services with sessionCount > 0" unification

---

## Cleanup

Delete all test rows created during this journey walkthrough:
- [ ] Archive "Smoke Test Pack (Edited)"
- [ ] Archive "Smoke Test Service"
- [ ] Delete/archive "Smoke Test Category" (if there's a delete path; otherwise leave it)
- [ ] Cancel any test instances from 2b
- [ ] Revert the test sales order cancellation from 3b (if possible)

If any cleanup operation fails, it's a secondary bug — file it but don't block on it.

---

## Phase 5 exit checklist

- [ ] All 5 journeys completed end-to-end without runtime errors
- [ ] No network failures in devtools
- [ ] No console errors that weren't already present on main
- [ ] Dev server logs show no oRPC errors
- [ ] Cleanup done (or known leftover items documented)
