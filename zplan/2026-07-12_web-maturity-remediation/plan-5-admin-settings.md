# Plan 5 — Admin/Settings: email-domains e2e + admin unit coverage + dead UI

**Agent scope:** access control, branch, announcements, notifications, audit, settings (email/billing/export-import/commission-cycles). Read [00-orchestration.md](00-orchestration.md) shared conventions first. Mostly test-writing; one small product-code cleanup.

## Goal
Cover the highest untested-complexity surface (email domains: ~1200 LOC, 14 procedures, zero e2e), add unit tests for the four logic-heavy admin pages that rely entirely on e2e, and resolve the permanently-disabled bulk-actions menu.

## User journeys affected
- **Owner configures a sending domain:** add domain → verify DNS/DMARC → create aliases → set routing. Today completely unproven by tests.
- **Admin reviews the audit log:** filters + infinite scroll + CSV export — no unit test today.
- **Admin manages members list:** sees "Bulk actions coming soon" menu items that never worked — removed (or implemented only if trivial).

## Tasks

### Task 1 — Email domains e2e
- New folder: `_e2e/web/email-domains/` — `smoke.spec.ts` + `email-domain.lifecycle.spec.ts`:
  - Drive via API (`page.request` → `/rpc/emailDomains.*`): create domain → assert verification-pending state + expected DNS records surfaced → alias create/list/delete → routing rule set/unset → domain delete.
  - Real DNS verification can't complete in test — assert the pending/failed state machine, not live verification. Use conditional `test.skip` guard if the tenant lacks the feature flag.
- Read `apps/web/src/routes/_authenticated/dashboard/_layout/settings/email.tsx:202-1266` first to enumerate the 14 procedures and pick the 6–8 that form the core lifecycle.

### Task 2 — Admin page unit tests
New files under `apps/web/src/__tests__/`:
- `pages/audit-log-page.test.tsx` — `audit/AuditLogPage.tsx`: list + 4 KPI queries render from mocks; infinite scroll fetches next page; `exportCsv` (`:217`) invoked with active filters; forbidden state.
- `pages/branch-page.test.tsx` — `branch/BranchPage.tsx`: hierarchy render; `hierarchy.updateNode` (`:296`) payload on edit incl. opening-hours fields (coordinate: this file is under active work on branch `wilfred/avantej-16-opening-hours` — if it has uncommitted changes at execution time, rebase the test on current behavior, do not modify the page itself).
- `pages/billing-identity-card.test.tsx` — `settings/billing-identity-card.tsx:28-131`: get/update/uploadLogo/removeLogo wiring; logo upload sends file payload.
- `pages/notifications-page.test.tsx` — `notifications/view.lazy.tsx:38-67`: list, markRead, markAllRead.
- `pages/announcements-behavior.test.tsx` — behavioral (NOT scope) tests for `AnnouncementsViewPage.tsx:106-195`: create/update/pin/deactivate payloads. (Existing `announcements-page-scope.test.tsx` covers only scope guards — leave it untouched.)

### Task 3 — Commission cycles + data export/import coverage
- `pages/commission-cycles.test.tsx` — the 5 `commissionCycle.*` wirings in `commissions/commission-cycles/*`.
- `pages/data-export-import.test.tsx` — `settings/export/DataExportPage.tsx` (3 procedures) + `import/DataImportPage.tsx` (5 procedures): request payloads, in-flight/disabled states, error surfacing.

### Task 4 — Bulk-actions dead menu
- `apps/web/src/components/pages/access-control/members/MembersFiltersBar.tsx:121-130`: menu items permanently `disabled title="Bulk actions coming soon"`. **Remove them** (and the menu if it becomes empty). Do not implement bulk actions in this plan — if the owner wants them, that's a feature with its own plan. Grep for any test referencing the menu before removing.

## Files owned
- `apps/web/src/components/pages/access-control/members/MembersFiltersBar.tsx`
- All new test files above; `_e2e/web/email-domains/**`

## Risks
- `BranchPage.tsx` overlaps the active opening-hours branch — this plan only ADDS a test for it, never edits the page. If the page's API changes mid-flight, the test agent adapts the test.
- Email-domains e2e must not send real email or mutate DNS — assert state machines only.
- Do NOT touch `_e2e/web/settings/` (Plan 2 adds a file there) — email specs live in their own `_e2e/web/email-domains/` folder.

## Verification
1. `cd apps/web && bun run test` — all new tests green; existing scope tests untouched and green.
2. Run `_e2e/web/email-domains/` specs.
3. Browser: members filter bar shows no dead menu items.
4. `bun check-types` clean.
