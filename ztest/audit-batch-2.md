# Audit Batch 2 — Attendance / Audit / Services / Customers / Trainers / Branch Create

**Date:** 2026-05-07

## E2E Test Results

### Attendance View — /dashboard/attendance/view

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads with heading and key sections visible | PASS | — |
| TC-02: no error boundary rendered | PASS | — |
| TC-03: date picker is present and shows a date value | PASS | — |
| TC-04: KPI cards area is rendered | **FAIL** | `getByText(/booked|checked.?in|no.?show|cancel/i).first()` resolved to hidden `<code>` element (`cancelled-sales/view`). The KPI label text regex matches a sidebar nav link text that is off-screen, not a visible attendance KPI card. |

### Audit Log View — /dashboard/audit/view

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads with audit log heading | PASS | — |
| TC-02: no error boundary rendered | PASS | — |
| TC-03: filter controls are present | PASS | — |
| TC-04: data table or empty state is rendered | PASS | — |

### My Services View — /dashboard/my-services/view

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads with My Services heading | PASS | — |
| TC-02: no error boundary rendered | PASS | — |
| TC-03: table or empty state is shown | PASS | — |
| TC-04: edit buffer dialog opens on edit button click | SKIP | Annotated `skip` — requires seeded service data |

### Customers View — /dashboard/customers/view

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads with customer list or empty state | PASS | — |
| TC-02: no error boundary rendered | PASS | — |
| TC-03: search or filter control is present | PASS | — |

### Walk-In Customers View — /dashboard/customers/walk-in/view

| Test | Status | Error |
|------|--------|-------|
| TC-01: redirects to /dashboard/customers/view | PASS | — |
| TC-02: no error boundary after redirect | PASS | — |

### Customer 360 — /dashboard/customers/$id

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads from list navigation | PASS | — |
| TC-02: no error boundary on customer detail page | PASS | — |
| TC-03: customer name and back link are visible | PASS | — |

### Trainers View — /dashboard/trainers/view

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads with Trainers heading and tabs | PASS | — |
| TC-02: no error boundary rendered | PASS | — |
| TC-03: Tiers tab navigates to tiers view | PASS | — |
| TC-04: trainers list or empty state is present on default tab | **FAIL** | Neither `table tbody tr` / `[role='row']` nor `/no trainers|no results|empty/i` text found (both counts = 0). The trainer list area renders neither rows nor a recognised empty-state string. |

### Trainers Tiers Redirect — /dashboard/trainers/tiers

| Test | Status | Error |
|------|--------|-------|
| TC-01: redirects to /dashboard/trainers/view?tab=tiers | PASS | — |
| TC-02: no error boundary after redirect | PASS | — |

### Branch Create — /dashboard/branch/create

| Test | Status | Error |
|------|--------|-------|
| TC-01: page loads with Create Branch heading and how-it-works card | PASS | — |
| TC-02: no error boundary rendered | PASS | — |
| TC-03: How it works info card shows hierarchy steps | PASS | — |
| TC-04: hierarchical form first step is visible | PASS | — |

**Batch summary:** 24 passed, 2 failed, 1 skipped (27 total)

---

## DB Integrity vs Relationship Docs

Raw results from `audit-db-batch2.ts` against org `996febce-aaad-4ded-8f47-02d2b566c8ee`:

```json
{
  "members_lead_source_id_col_exists": false,
  "lead_sources_count": "0",
  "walk_in_conversion_cols": [],
  "walk_in_customers_count": "2",
  "members_household_id_col_exists": false,
  "households_count": "0",
  "check_ins_package_fk": "0",
  "check_ins_count": "3",
  "check_ins_package_columns": ["package_instance_id"],
  "customer_profiles": "17",
  "trainer_tiers": "3",
  "trainer_availability": "12",
  "hierarchy_by_type": [
    { "type": "organization", "count": "1" },
    { "type": "region",       "count": "4" },
    { "type": "country",      "count": "4" },
    { "type": "branch",       "count": "3" },
    { "type": "area",         "count": "4" }
  ],
  "member_profiles": "4",
  "members_invitation_id_col": [],
  "members_count": "18"
}
```

| Plan Item | Relationship Doc Ref | Plan Says | Actual (DB) | Verdict |
|-----------|---------------------|-----------|-------------|---------|
| `members.lead_source_id` column | Agent 3.2 | Column should exist on `members` linking to `lead_sources` | Column **absent** on `members`. `lead_sources` table exists but has 0 rows. | **DRIFT** — column was never added to `members` |
| `lead_sources` table | Agent 3.2 | Table should exist | Table exists, 0 rows | PARTIAL — table created, no seed data, FK column missing |
| `walk_in_customers.customer_profile_id` | Sales #7 / Agent 3.5 | Conversion FK added for walk-in → customer_profile linkage | Column **absent** (conversion cols: `[]`). Table has 2 rows. | **DRIFT** — conversion FK never added |
| `walk_in_customers.converted_at` | Sales #7 / Agent 3.5 | `converted_at` timestamp column should exist | Column **absent** | **DRIFT** — column never added |
| `members.household_id` column | Agent 3.6 | Column should exist on `members` | Column **absent**. `households` table exists with 0 rows. | **DRIFT** — column never added to `members` |
| `households` table | Agent 3.6 | Table should exist | Table exists, 0 rows | PARTIAL — table created, no seed data, FK column missing |
| `check_ins.package_instance_id` FK constraint | Appointments #4 | Should be a proper FK constraint, not plain UUID | Column `package_instance_id` exists but FK constraint count = 0 | **DRIFT** — column present as plain UUID, FK constraint missing |
| `members.invitation_id` column | Identity #4 | Column should exist for audit link | Column **absent** (neither `invitation_id` nor `invitationId`) | **DRIFT** — column never added |
| `customer_profiles` count | Sanity | Populated with test data | 17 rows | OK |
| `trainer_tiers` count | Trainer feature | Tiers table should have data | 3 rows | OK |
| `trainer_availability` count | Trainer feature | Availability slots should exist | 12 rows | OK |
| `member_profiles` count | Member profile feature | Profiles table should have data | 4 rows | OK |
| `hierarchy_nodes` by type | Hierarchy sanity | Org → regions → countries → areas → branches | 1 org / 4 region / 4 country / 4 area / 3 branch | OK |

---

## Issues Found

### E2E Failures

**Issue E2-1: Attendance View TC-04 — KPI labels regex matches hidden sidebar nav text**
- File: `e2e/batch2.dashboard.spec.ts:52`
- The locator `getByText(/booked|checked.?in|no.?show|cancel/i)` matches a `<code>` element in the sidebar showing the route `cancelled-sales/view` (which contains the substring "cancel"). That element is hidden (off-screen).
- Fix options:
  1. Scope the locator to the main content area: `page.locator('main').getByText(...)` 
  2. Or look for a more specific KPI card selector (e.g., `[data-testid="attendance-kpi"]`)
- Root cause: The attendance page may not render KPI cards at all (no data) and the empty-state text doesn't match the regex, while the sidebar route string does.

**Issue E2-2: Trainers View TC-04 — neither rows nor empty state text found**
- File: `e2e/batch2.dashboard.spec.ts:308`
- The trainers list area renders with 0 `<table tbody tr>` rows and 0 elements matching `/no trainers|no results|empty/i`.
- Possible causes:
  1. The default tab renders a different component structure (cards not table rows, or a loading skeleton).
  2. The empty state text uses different wording not matched by the regex (e.g. "No trainers found", which would match — but "No staff assigned" or similar would not).
  3. A rendering error silently swallows the content without triggering the error boundary.
- Fix: Inspect the screenshot at `test-results/batch2.dashboard-Trainers--b85d8-e-is-present-on-default-tab-dashboard-e2e/test-failed-1.png` and update the test locator to match the actual empty-state text/structure.

### DB Integrity Gaps (Schema Drift)

**Issue DB-1: `members.lead_source_id` column missing**
- `lead_sources` table exists (0 rows) but the FK column `lead_source_id` was never added to `members`.
- Impact: Agent 3.2 lead-source tracking is non-functional; any code referencing `members.lead_source_id` will fail at runtime.

**Issue DB-2: `walk_in_customers` conversion columns missing**
- `walk_in_customers` table has 2 rows but lacks `customer_profile_id` and `converted_at` columns.
- Impact: Walk-in → registered customer conversion flow (Sales #7) cannot be completed.

**Issue DB-3: `members.household_id` column missing**
- `households` table exists (0 rows) but the FK column `household_id` was never added to `members`.
- Impact: Agent 3.6 household grouping is non-functional.

**Issue DB-4: `check_ins.package_instance_id` is a plain UUID (no FK constraint)**
- Column exists but the referential integrity constraint is absent.
- Impact: Orphaned check-in records can accumulate if package instances are deleted; no cascade/restrict protection.

**Issue DB-5: `members.invitation_id` column missing**
- Identity #4 requires an `invitation_id` audit link on `members`, but the column does not exist under either naming convention (`invitation_id` / `invitationId`).
- Impact: Invitation audit trail for member onboarding is incomplete.

### Data Observations

- `lead_sources` and `households` tables exist with 0 rows — likely created by migrations but never seeded.
- `walk_in_customers` has 2 rows with no conversion data, consistent with DB-2.
- `trainer_tiers` (3), `trainer_availability` (12), `customer_profiles` (17) look healthy for the test org.
- `member_profiles` has only 4 rows for 18 members — 14 members have no profile record (may be by design if profiles are optional).
