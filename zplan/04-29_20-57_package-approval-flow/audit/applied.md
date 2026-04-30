# Audit Apply: 04-29_20-57_package-approval-flow

**Applied:** 2026-04-29 21:40
**Source report:** audit/report.md (audited 2026-04-29 21:30)
**Plan file:** plan/plan.md
**Freshness:** ok (report mtime is newer than plan mtime)

## Summary
| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 5 |
| Broken refs left as TODO | 1 |
| Callers added to impact section | 6 |
| Structural sections stubbed | 0 |
| Unresolved questions consolidated | 0 |
| Deferred (process gaps) | 4 |

## Changes

### Auto-fixes
- §3.5 Frontend architecture (Web Approvals page) — clarified `operations/` route group does not exist and must be created in Phase 3 (finding: missing route directory).
- §3.3 API contracts (organizationSettings) — noted service helpers are `getSetting`/`upsertSetting`, not `get`/`set` (finding: symbol discrepancy).
- §3.2 Schema changes (note on existing columns) — replaced `scripts/lookup-customer-profile.ts` with `apps/server/scripts/lookup-customer-profile.ts` (finding: wrong path).
- §1.1 Phase 1 task — replaced `bun run scripts/migrate-all-tenants.ts` with `bun run apps/server/scripts/migrate-all-tenants.ts` (finding: wrong path).
- §1.5 — added an explicit note that `packages/services/src/appointment.service.ts` line 289 already enforces `status !== "active"`, framing the router-level guard as belt-and-suspenders (finding: missing impact / duplication of existing guard).
- §1.6 — added `apps/native/app/(app)/dashboard/packages/[id].tsx` as a second `STATUS_BADGE` site that must also receive the `pending` entry (finding: symbol discrepancy — two STATUS_BADGE maps).
- §2.1 Notification fan-out helper — replaced `packages/services/src/notifications.service.ts` (plural; does not exist) with `packages/services/src/notification.service.ts` (singular; exists). Updated wording from "likely exists — verify" to "existing — extend" (finding: broken reference + create-from-scratch confusion).
- §3.4 Sidebar nav — replaced `apps/web/src/components/main-chrome/sidebar.tsx` with `apps/web/src/components/app-sidebar.tsx` and `apps/web/src/components/nav-main.tsx` (finding: wrong path; `main-chrome/` directory does not exist).
- §6 Impact & Breakage Analysis (table) — added six unlisted callers/readers of `package_instances.status` and `packageInstances.create`: `customer-profile-panel.tsx`, `package-instances/view/columns.tsx`, `apps/native/.../dashboard/index.tsx`, `packages/api/src/routers/check-ins.ts`, `assign-package-dialog.tsx`, `instances-page.tsx`, plus the `test-write-endpoints.ts` smoke test (finding: missing impact).
- §1.4 Phase 1 task — added the same web/server callers as a sub-bullet for verification of `source: "assigned"` (finding: missing impact, plus correctness concern flagged by audit).
- §6 Blocking prerequisites — clarified item 2 (notification.service.ts singular, exists), item 3 (organizationSettings helper names), and added a new item 5 about migration slot verification.
- §Summary of files (New / Modified) — updated paths: removed `notifications.service.ts` and `main-chrome/sidebar.tsx`; added `app-sidebar.tsx`, `nav-main.tsx`, `notification.service.ts`, the impacted callers, the operations route-group entry, and the smoke test.

### TODOs injected
- §1.1 Phase 1 — `<!-- TODO (audit): the next free migration slot must be confirmed — MIGRATION_0018_* is already taken... Determine the correct next slot before generating. -->` (finding: speculative migration number; could not unambiguously auto-resolve because the file mixes both numbered and named entries beyond `0029`).

### Deferred
- No `execute/log.md` — run `/execute` when ready.
- No `chrome-test/` directory — run `/chrome-plan` when ready.
- No `research/brief.md` — pre-plan research not captured (process gap, not a plan gap).
- No `prompts/` directory — execution handoffs not generated yet.

## Next steps
1. Resolve the injected `TODO (audit)` marker about the migration slot in `plan/plan.md` (verify against `packages/db/src/migrate-tenant.ts` and pick the next free number).
2. Re-run `/audit 04-29_20-57_package-approval-flow` to confirm the plan is clean.
3. When ready, run `/execute` to begin Phase 1 and `/chrome-plan` for browser verification setup.
