# Audit Batch 1 — Dashboard Home / Access Control / Appointments

**Date:** 2026-05-07
**Playwright run:** dashboard-e2e project
**Spec file:** `e2e/batch1.dashboard.spec.ts`

---

## E2E Test Results

### Dashboard Home (/dashboard)

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads with key widgets visible | ✅ passed | — |
| TC-02: no error boundary | ✅ passed | — |
| TC-03: KPI section and quick actions visible | ✅ passed | — |
| TC-04: period param — page still loads with explicit period | ✅ passed | — |

### Access Control Roles (/dashboard/access-control/roles)

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads — Roles tab visible by default | ✅ passed | — |
| TC-02: no error boundary | ✅ passed | — |
| TC-03: Permissions tab button visible and clickable | ✅ passed | — |
| TC-04: direct navigation to Permissions tab renders content | ✅ passed | — |

### Role View (detail via roles list)

| Test | Status | Error |
|------|--------|-------|
| TC-01: legacy /dashboard/role/view redirects to roles tab | ✅ passed | — |
| TC-02: no error boundary on redirect destination | ✅ passed | — |
| TC-03: navigate to roles list and open first role if rows exist | ⏭️ skipped | "No role rows found — skipping detail navigation" (conditional skip; roles table has data but the table UI showed no clickable rows at runtime) |

### Access Control User Assignment (/dashboard/access-control/user-assignment)

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads — Staff Access heading and Members tab visible | ✅ passed | — |
| TC-02: no error boundary | ✅ passed | — |
| TC-03: Invitations tab button visible and switches tab | ✅ passed | — |
| TC-04: Members tab shows a list or empty state (no crash) | ✅ passed | — |

### Access Control Permissions (legacy redirect)

| Test | Status | Error |
|------|--------|-------|
| TC-01: redirects to roles page with permissions tab | ✅ passed | — |
| TC-02: no error boundary after redirect | ✅ passed | — |

### Access Control Invitations (legacy redirect)

| Test | Status | Error |
|------|--------|-------|
| TC-01: redirects to user-assignment with invitations tab | ✅ passed | — |
| TC-02: no error boundary after redirect | ✅ passed | — |

### Appointment View (/dashboard/appointment/view)

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads — appointment list area visible | ✅ passed | — |
| TC-02: no error boundary | ✅ passed | — |
| TC-03: page content renders (appointments or empty state, no crash) | ✅ passed | — |

### Appointment Class Slots View (/dashboard/appointment/class-slots/view)

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads — table or empty state visible | ❌ failed | `toBeVisible` timeout (8s): `locator('table, [data-testid='empty-state'], [class*='empty']').first()` — element not found. Page renders without a `<table>`, `[data-testid=empty-state]`, or `[class*=empty]` element. |
| TC-02: no error boundary | ✅ passed | — |
| TC-03: create button (plus) is visible | ✅ passed | — |
| TC-04: table columns visible when rows exist | ⏭️ skipped | "No class slot rows found — skipping column check" (DB has 0 class_slots rows) |

### Rooms View (redirect) (/dashboard/rooms/view)

| Test | Status | Error |
|------|--------|-------|
| TC-01: redirects to service/view with rooms tab | ✅ passed | — |
| TC-02: no error boundary after redirect | ✅ passed | — |

**Batch 1 summary: 23 passed, 1 failed, 2 skipped** (total 26 tests)

---

## DB Integrity vs Relationship Docs

DB checked against tenant org `996febce-aaad-4ded-8f47-02d2b566c8ee` ("Test Fitness Franchise").

| Plan Item | Relationship Doc Ref | Plan Says | Actual (DB) | Verdict |
|-----------|---------------------|-----------|-------------|---------|
| `members.role_id` column added | Identity #1 | Column exists alongside text `role` col (additive, not replace) | Column exists (`members_role_id_column_exists = 1`) | ✅ column added |
| `members.role_id` backfilled for existing members | Identity #1 | All existing members have `role_id` set after migration backfill | 0 / 18 members have `role_id` set (all 18 are NULL) | ❌ GAP — backfill never ran |
| `appointment_status_history` table exists | Appointments #3 | Table created for per-status-transition audit | Table exists | ✅ table created |
| `appointment_status_history` populated | Appointments #3 | Row per status transition; 60 appointments means ≥60 history rows | 0 rows, 60 appointments | ❌ GAP — no history rows; existing appointments have no baseline history entry |
| EXCLUDE constraint on `appointments` (trainer) | Appointments #7 | `EXCLUDE USING gist (trainer_id WITH =, tstzrange(...) WITH &&)` with `WHERE status <> 'cancelled'` | `appointments_trainer_no_overlap` EXCLUDE constraint present | ✅ constraint exists |
| EXCLUDE constraint on `appointments` (room) | Appointments #7 | Similar room-overlap EXCLUDE | `appointments_room_no_overlap` EXCLUDE constraint present | ✅ constraint exists |
| `btree_gist` extension installed (prerequisite for tstzrange EXCLUDE) | Appointments #7 (prerequisite) | Extension required for GiST-based EXCLUDE | `btree_gist` installed | ✅ installed |
| `class_slots` table exists and has seed data | — | Table created; class slots seeded for testing | Table exists; 0 rows | ⚠️ PARTIAL — table exists but empty; causes TC-04 skip and TC-01 selector mismatch |

**Supporting context:**
- `roles` table: 7 roles (4 system: admin, client, staff, trainer; 3 test roles)
- `role_permissions` table: 105 rows — role permissions are wired
- `invitations` table: 6 rows
- `hierarchy_nodes` table: 16 nodes

---

## Issues Found

### Issue 1: members.role_id backfill never ran
**Type:** Data gap / Missing migration step
**Impact:** The `role_id` column was added to `members` but no migration backfill populated it for the 18 existing members. Any UI or API logic that reads `role_id` to derive role associations (custom role assignment, RBAC fast-path using custom roles) will find NULL for all existing members. The E2E test for the Roles tab skipped the row-click test ("No role rows found"), which may be a symptom: if the roles list page fetches members joined on `role_id`, the association is broken.
**Fix needed:** Run a backfill migration mapping each member's text `role` column to the corresponding `roles.id` UUID. Script should JOIN `members.role` to `roles.name`, update `members.role_id = roles.id` where matched, and report any unmatched values (e.g., legacy free-text roles not in the `roles` table).

### Issue 2: appointment_status_history has 0 rows despite 60 appointments
**Type:** Data gap / Missing trigger or service-layer write
**Impact:** The `appointment_status_history` table was created (schema gap addressed) but the application never writes to it. Any feature that depends on status audit trail (commission dispute resolution, refund policy, no-show penalties) has no data to work with. Historical appointments (all 60) have no baseline "created" or current-status row.
**Fix needed:** (a) Add a service-layer write to `appointment_status_history` on every appointment status change — at minimum on creation (recording the initial status). (b) Run a one-time backfill to insert a baseline history row for each of the 60 existing appointments using their current `status` and `updatedAt` as the transition timestamp.

### Issue 3: Class Slots page renders without testable content container
**Type:** Test selector mismatch / Missing empty-state markup
**Impact:** TC-01 fails because the page renders without a `<table>`, `[data-testid=empty-state]`, or `[class*=empty]` element. The DB has 0 `class_slots` rows, so the page is in empty state — but the empty state component does not use any of the expected selectors. TC-03 (create button visible) passed, confirming the page loads; only the content/empty-state container is missing the expected markup.
**Fix needed:** Either (a) add `data-testid="empty-state"` to the empty state rendered by the Class Slots page component, or (b) ensure the page wraps content in a `<table>` (even when empty, with a `<tbody>` containing a colspan empty row). Option (a) is lower-risk.

### Issue 4: Role View TC-03 skip — roles table rows not visible in UI
**Type:** Data / UI rendering note (low severity — conditional skip, not failure)
**Impact:** The test skipped because "No role rows found" in the UI despite the `roles` table having 7 rows. This suggests the roles list table either (a) filters on a condition that excludes the test data, (b) uses pagination that doesn't render rows within the test's wait window, or (c) the member `role_id` backfill gap (Issue 1) causes a JOIN to return no displayable rows. Not blocking but masks role-detail navigation tests.
**Fix needed:** Investigate why the roles list table shows no rows in the E2E browser session. Cross-check whether the roles list API call requires `role_id` associations to show roles. If so, fixing Issue 1 may unblock this.
