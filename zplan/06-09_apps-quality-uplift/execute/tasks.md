# Task Inventory

**Plan:** zplan/06-09_apps-quality-uplift/prompts/06-09_apps-quality-uplift.md
**Generated:** 2026-06-09
**Mode:** phase-gated
**Total tasks:** 9 plan tasks → decomposed below

## Phase 1 — Web data-fetching standardization (3 parallel agents, disjoint files)

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 1 | Fix string-key invalidations in features/refunds + features/approvals + features/appointments + components/refunds (8 files) | Agent A (frontend) | done |
| 2 | 1 | Fix string-key invalidations in components/calendar + attendance + appointments + invitations + hooks/useTrainerActions (7 files) | Agent B (frontend) | done (invitations 2 sites left as-is: hand-rolled source query, no orpc key) |
| 3 | 1 | Fix string-key invalidations in components/pages/* + components/forms + routes/* (12 files) | Agent C (frontend) | done |
| 3b | 1 | TAIL (orchestrator): fixed partial-refund-dialog.tsx:93 (decoupled by Agent A's source migration → orpc.refunds.list.key()). Confirmed 11 other tail sites (user-context, platformAdminTenants, platform-admin-payments, invitations) are CORRECT hand-rolled prefix invalidations — not bugs. | Orchestrator | done |

## Phase 2 — Server auth + type-safety (2 agents, disjoint)

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 4 | 2 | context.ts: remove console.log @44/49/69, dedupe session+member lookup, preserve context shape | Agent A (backend) | done — extracted resolveMemberContext() helper used by both context.ts + middleware; 3 console.log removed; shape preserved; check-types 0 |
| 5 | 2 | Reconcile server-router type stubs; investigate appRouter cast; reduce backend `any`; rebuild packages/api | Agent B (backend) | done — fixed 3 real drifts (auth.userContext +isSystemAdmin/+permissions, invitations.acceptWithSignup +ghlSync, subscriptions.getStatus required fields); cast KEPT (documented cold-build workaround); any-reduction DEFERRED (no low-risk wins in owned files; 724 total need dedicated pass) |

## Phase 3 — Tenant migration renumbering (1 agent, SOLO migrations/)

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 6 | 3 | Renumber tenant migrations | Orchestrator | SKIPPED (user decision) — runner keys applied-state on filename-hash (migrate-tenant.ts:160 / gen-tenant-migrations.ts:82). Renaming would re-run migrations on live tenants for cosmetic gain. Dupes are distinct full filenames; runner handles them correctly via HISTORICAL_ORDER + lex. No action; history left untouched. |

## Phase 4 — Web god-component decomposition (parallel, ONE file each)

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 7a | 4b | Decompose components/pos/pos-workflow.tsx (1791) → components/pos/workflow/* | DONE (05449a4b) | 1791→797 LOC; PosWorkflow export preserved; installment amount + commission routing intact; pos-workflow.test.tsx 4/4 |
| 7b | 4b | Decompose members-tab.tsx (1508) → access-control/members/* | DONE (05449a4b) | 1508→630 LOC; MembersTabPage export preserved; RBAC handlers in orchestrator; members-tab.test.tsx 16/16 |
| 7c | 4 | Decompose appointment/class-slots/view.tsx (1460) → components/pages/class-slots/* | Agent C (frontend) | pending |
| 7d | 4 | Decompose reports/view.tsx (1292) → components/pages/reports/* | Agent D (frontend) | pending |
| 7e | 4 | Decompose announcements/view.tsx (1211) → components/pages/announcements/* | Agent E (frontend) | pending |
| 7f | 4 | Decompose branch/view.tsx (1129) → components/pages/branch/* | Agent F (frontend) | pending |

## Phase 5 — Web high-risk unit tests (parallel)

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 8a | 5 | Unit tests for pos-workflow | — | DONE by concurrent session (f0ba5cf2: __tests__/components/pos/pos-workflow.test.tsx) |
| 8b | 5 | Unit tests for members-tab | — | DONE by concurrent session (f0ba5cf2: __tests__/components/pages/access-control/members-tab.test.tsx) |
| 8c | 5 | Unit tests for commission-payouts | — | DONE by concurrent session (f0ba5cf2: __tests__/features/payouts/payouts.test.tsx) |

## Phase 6 — Server combined-test isolation

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 9 | 6 | Make unit suite green via per-file isolation | Orchestrator | DONE — isolated runner (run-unit-isolated.ts) already existed + CI runs `test:unit:isolated` (ci.yml:46). Fixed 1 regression MY Phase 2 introduced: added resolveMemberContext to the services barrel mock in orpc-tenant.middleware.test.ts. Suite: 67/67 green (commit aff0d9fe). |
