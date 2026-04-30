# Audit: 04-29_20-57_package-approval-flow

**Audited:** 2026-04-29 21:30
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard
| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 8 (6 wrong paths, 2 missing files requiring creation) |
| Missing impact | 6 files with unlisted callers |
| Unresolved questions | 0 explicit markers (4 named open questions in §8, all with inline recommendations) |
| Execution state | not started |

---

## Findings

### Structural gaps

All 8 sections are present with substantive content. No structural gaps.

---

### Broken references (plan → codebase)

**File paths that do not exist at the stated location:**

- `packages/db/src/schema/tenant/package-instance-staff.ts` — MISSING (new file, correctly noted as to-be-created)
- `packages/services/src/notifications.service.ts` — **MISSING**. Plan §2.1 says "likely exists — verify"; it does NOT exist. Must be created from scratch.
- `apps/web/src/routes/_authenticated/dashboard/_layout/operations/approvals.tsx` — MISSING (new file; no `operations/` route group exists at all under `_layout/`)
- `apps/web/src/components/forms/assign-trainer-drawer.tsx` — MISSING (new file, correctly noted)
- `apps/web/src/components/forms/reject-package-dialog.tsx` — MISSING (new file, correctly noted)
- `apps/web/src/components/main-chrome/sidebar.tsx` — **WRONG PATH**. There is no `main-chrome/` directory. The actual sidebar is `apps/web/src/components/app-sidebar.tsx`; nav items live in `apps/web/src/components/nav-main.tsx`.
- `scripts/migrate-all-tenants.ts` — **WRONG PATH**. Actual locations: `apps/server/scripts/migrate-all-tenants.ts` and `packages/db/src/scripts/migrate-all-tenants.ts`. No root-level `scripts/` directory exists.
- `scripts/lookup-customer-profile.ts` — **WRONG PATH**. Actual location: `apps/server/scripts/lookup-customer-profile.ts`.

**Symbol discrepancies:**

- `organizationSettings.get` / `organizationSettings.set` (§3.3) — the service functions are named `getSetting` and `upsertSetting` in `packages/services/src/organization-settings.service.ts`, not `get`/`set`.
- `STATUS_BADGE` (§1.6) — the plan assigns the pending badge update only to `packages/index.tsx`, but `packages/[id].tsx` has its own separate `STATUS_BADGE` map that also needs the `"pending"` entry.
- `MIGRATION_0018_*` (§1.1) — migration number is speculative; must be verified against the current `TENANT_MIGRATIONS` array before generating.

---

### Missing impact

The plan's files-affected lists omit several callers that will be visibly or semantically affected:

1. **`packageInstances.create` callers not listed:**
   - `apps/web/src/components/packages/assign-package-dialog.tsx` — calls `packageInstances.create` (staff-assigns packages via web); not in files-affected. Must confirm it passes `source: "assigned"` to bypass the gate.
   - `apps/web/src/components/pages/packages/instances-page.tsx` — also calls `packageInstances.create`; not listed. Same concern.
   - `apps/server/scripts/test-write-endpoints.ts` — smoke-tests `packageInstances.create`; not listed. Test assertions on response status may break.

2. **`package_instances.status` enum readers not listed:**
   - `apps/web/src/components/customers/customer-profile-panel.tsx` — filters `p.status === "active"` to count active packages (line 370). A pending package will not be counted, which changes the "active packages" badge but the file is not listed.
   - `apps/web/src/components/tables/package-instances/view/columns.tsx` — renders `status === "active"` as `"default"` badge variant, all others as `"outline"`. A `"pending"` value will silently render as outline-labelled "Pending" — may be acceptable but not a conscious plan decision.
   - `apps/native/app/(app)/dashboard/index.tsx` — calls `packageInstances.getActiveForClient` which hardcodes `status: "active"`; correctly excludes pending packages but not acknowledged in impact analysis.
   - `packages/api/src/routers/check-ins.ts` — hardcodes `eq(packageInstances.status, "active")` in its query; correctly excludes pending packages from check-in deductions but not listed.

3. **Appointment guard duplication:** `packages/services/src/appointment.service.ts` line 289 already performs `if (lockedPkg.status !== "active")` rejection before plan execution. The proposed router-level guard in §1.5 is redundant as a primary enforcement; the plan presents it as novel without noting the existing service-layer guard.

---

### Unresolved questions

No `TBD`, `TODO`, `???`, or similar markers found in the plan text. All four open questions in §8 carry explicit recommendations. No blocking unresolved decisions.

---

### Execution & verification gaps

- No `execute/log.md` — `/execute` has NOT been run.
- No `chrome-test/` directory — no browser verification plan or results.
- No `research/brief.md` — no pre-plan research phase captured.
- No `prompts/` directory — no execution handoffs generated.

The plan is at "written, not yet executed" lifecycle stage.

---

## Priority Actions

1. **Fix the sidebar file path** before Phase 3: replace all references to `apps/web/src/components/main-chrome/sidebar.tsx` with `apps/web/src/components/app-sidebar.tsx` (and `nav-main.tsx` for nav items). The `main-chrome/` directory does not exist.

2. **Fix the scripts paths**: `scripts/migrate-all-tenants.ts` → `apps/server/scripts/migrate-all-tenants.ts`; `scripts/lookup-customer-profile.ts` → `apps/server/scripts/lookup-customer-profile.ts`.

3. **Create `notifications.service.ts` from scratch**: phase 2 is blocked until this file exists. The plan should change "likely exists — verify" to "must create" and include the minimum export signature.

4. **Update both `STATUS_BADGE` maps**: Phase 1 task §1.6 only mentions `packages/index.tsx`, but `packages/[id].tsx` has its own separate `STATUS_BADGE` that also needs the `"pending"` entry.

5. **Add web callers of `packageInstances.create` to files-affected**: `assign-package-dialog.tsx` and `instances-page.tsx` both call the mutated endpoint on the web side. Verify `source: "assigned"` is correctly set so staff workflows bypass the gate.

6. **Note the existing appointment guard**: `appointment.service.ts` line 289 already rejects `status !== "active"`. The plan's §1.5 router-level guard is belt-and-suspenders — document it as such rather than implying the protection is new.

7. **Create the `operations/` route group**: no `operations/` folder exists under `_layout/`. Phase 3 must also add the directory and any required `_layout` wrapper file that TanStack Router expects for the group.

8. **Verify migration number before generating**: the assumed `MIGRATION_0018_*` slot must be confirmed against the current last entry in `TENANT_MIGRATIONS` in `packages/db/src/migrate-tenant.ts`.

---

## Status rationale

**needs-attention** — 2 wrong file paths (sidebar, scripts), 2 "create from scratch" files the plan treats as "probably already exist" (notifications.service.ts, operations route group), and 6 callers of modified files not listed in the impact section. The appointment guard duplication is a minor clarity issue. No single finding is critical, but the sidebar path and missing notifications service would cause Phase 3 and Phase 2 to fail without correction.
