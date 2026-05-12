# Swarm Audit — GAPS.md (Post-Apply Re-Run)
**Session:** zplan/05-06_09-12_schema-relationship-fixes
**Run at:** 2026-05-06 (2nd pass — after --apply amendments)
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 28 (C 8 · H 13 · M 7 · L 1)

> **vs. First Run (49 findings):** 21 findings resolved by --apply. 8 new findings introduced or newly visible. Net: 28 open.

---

## Priority Fix Order

### P1 — Critical (block execution — fix before any /execute)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| C1 | schema-drift | Agent migration filenames reference old (taken) 00XX slots | Plan §5 all agent owner-files | Renumber all to 0021+ per mapping in schema-drift.md |
| C2 | api-surface | Router `memberships.ts` does not exist | `packages/api/src/routers/` | Agent 3.1 creates from scratch + registers in baseRouter |
| C3 | api-surface | Router `households.ts` does not exist | `packages/api/src/routers/` | Agent 3.6 creates from scratch + registers in baseRouter |
| C4 | api-surface | Router `inventory.ts` does not exist | `packages/api/src/routers/` | Agent 2.6 creates from scratch + registers in baseRouter |
| C5 | api-surface | `refunds.createPartial` procedure missing | `packages/api/src/routers/refunds.ts` | Agent 2.8 adds `createPartial: protectedProcedure` |
| C6 | api-surface | `walk-in-customers.convertToPackage` missing | `packages/api/src/routers/walk-in-customers.ts` | Agent 3.5 adds `convertToPackage: protectedProcedure` |
| C7 | type-safety | `creditsRemaining` is computed column — Agent 2.8 FOR UPDATE pattern is wrong | `packages/db/src/schema/tenant/package-instances.ts:48` | Redesign: increment `credits_used`, generated col auto-updates |
| C8 | type-safety | `updatedMember!` non-null assertion in members.ts:512 | `packages/api/src/routers/members.ts:512-517` | Add explicit null check with `ORPCError NOT_FOUND` |

### P2 — High (fix before merging)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| H1 | schema-drift | `preferred_trainer_id` FK added without NOT VALID guard | `packages/db/migrations/tenant/0019_gray_rachel_grey.sql` | Validate via live DB query before Phase 1 dispatch |
| H2 | api-surface | Error mapper path inconsistency — two paths in Agent 2.4 | Plan §5 Agent 2.4 | Standardize to `apps/server/src/lib/orpc-error-mapper.ts` |
| H3 | api-surface | `members.updateRole` input shape mismatch | `packages/api/src/routers/members.ts:399-405` | Agent 2.1 adds optional `roleId: uuid` to input |
| H4 | test-coverage | Agent 2.7 (status history) test annotation not in owner-files | Plan §5 Agent 2.7 | Add `status-history.test.ts` to Agent 2.7 owner-files |
| H5 | test-coverage | Agent 2.2 (pricing) test annotation not in owner-files | Plan §5 Agent 2.2 | Add `pricing.test.ts` to Agent 2.2 owner-files |
| H6 | test-coverage | Agent 2.6 (stock movements) no test file | Plan §5 Agent 2.6 | Add `stock-movements.test.ts` to Agent 2.6 owner-files |
| H7 | test-coverage | Agent 2.5 (commission versioning) no test file | Plan §5 Agent 2.5 | Add `commission-versioning.test.ts` to Agent 2.5 owner-files |
| H8 | test-coverage | Agent 2.8 (refund items) no test file | Plan §5 Agent 2.8 | Add `refund-items.test.ts` to Agent 2.8 owner-files |
| H9 | doc-consistency | Agent 3.2 owner-files references non-existent `customers.ts` | Plan §5 Agent 3.2 | Change to `customer-profiles.ts` |
| H10 | doc-consistency | Agent 2.5 owner-files lists `commission.service.ts` (still stale) | Plan §5 Agent 2.5 | List 3 real commission service files |
| H11 | scalability | Pagination mismatch — cursor claim vs offset codebase reality | `packages/api/src/routers/sales-orders.ts:28-29` | Decide cursor vs offset; make per-agent briefs explicit |
| H12 | scalability | LRU cache utility does not exist | `packages/services/src/` | Create `cache.utility.ts` in Agents 2.2/2.3 before shipping |
| H13 | scalability | Auto-resume cron frequency unspecified | Plan §5 Agent 3.1 | Specify frequency + idempotency in Agent 3.1 brief |

### P3 — Medium (fix before shipping)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| M1 | schema-drift | Agent 2.10 scope label "modify" should be "verify only" | Plan §5 Agent 2.10 owner-files | Change entry to "(verify only — col + index already present)" |
| M2 | test-coverage | Phase 3 test coverage model undefined | Plan §5 Phase 3 section | Add test file per Phase 3 agent (3.1, 3.5, 3.6 minimum) |
| M3 | test-coverage | Commission service naming drift blocks test authoring | Plan §5 Agent 2.5/2.9 | Disambiguate which of 3 commission files each agent extends |
| M4 | type-safety | Agent 2.9 DEFERRABLE FK requires raw SQL migration | Plan §5 Agent 2.9 | Mandate raw SQL for deferrable constraint in migration `0031_` |
| M5 | type-safety | `refund_items` triple-FK CHECK missing DB enforcement | Plan §5 Agent 2.8 migration | Add `num_nonnulls(...)` CHECK in migration SQL |
| M6 | scalability | Stock movements partition strategy still unresolved (Q2) | Plan §8.2 Q#2 | Decide: drop partitioning OR implement partition-creation cron |
| M7 | scalability | `payout_batches.totals` stored vs computed ambiguity | Plan §5 Agent 2.5 schema | Specify approach: stored+FOR UPDATE or computed at query time |

### P4 — Low / Info

- **L1 (scalability):** §7 index checklist updated but agent migration task descriptions don't list index creation alongside FK addition
- **I1 (type-safety):** `hierarchy.ts:28` unsafe `any` cast — fix before Phase 2 agents copy pattern
- **I2 (type-safety):** `installment.service.ts:760` unsafe `(err as any).code` — fix before agents add adjacent code
- **I3 (scalability):** Agent 2.9 notification send must be AFTER transaction commit — add to agent brief

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift | 1 | 1 | 1 | 0 | 0 | Partial — AF8 applied, filenames not updated |
| api-surface | 5 | 1 | 1 | 0 | 0 | No change — same 5 missing procedures/routers |
| test-coverage | 3 | 5 | 1 | 0 | 0 | 2 new gaps (H4, H5) not applied during --apply |
| doc-consistency | 2 | 2 | 0 | 0 | 0 | 2 are regressions introduced by --apply annotations |
| type-safety | 2 | 2 | 2 | 0 | 0 | C7 (computed col) is new critical from 2nd pass |
| scalability | 0 | 3 | 3 | 1 | 0 | H11/H12 unresolved, H13 new |
| **Total (de-duped)** | **8** | **13** | **7** | **1** | **0** | |

---

## What --apply Fixed (Resolved Findings from Run 1)

| # | Finding | Applied |
|---|---------|---------|
| AF1 | Phase 3 "true parallel" claim corrected to sequential | ✅ |
| AF2 | Conflict matrix `commission.service.ts` → 3 real files | ✅ |
| AF3 | Conflict matrix `refund.service.ts` → `refunds.service.ts` | ✅ |
| AF4 | Phase 0 task 0.1 scope: "create from scratch" not "rewrite" | ✅ |
| AF5 | Phase 0 task 0.4: `tenant-migrate.test.ts` added to scope | ✅ |
| AF6 | Task 1.2 annotated as validation-only (preferred_trainer_id already at 0019) | ✅ |
| AF7 | Agent 2.10 scope reduced to verify-only (payment_items.promotionId exists) | ✅ |
| AF8 | Phase 1 header: MIGRATION RENUMBER REQUIRED warning added | ✅ |
| — | §6 Affected routers: `commission.ts` → `commission-splits.ts`; `customers.ts` annotated | ✅ |
| — | §7 index checklist: 5 missing FK indexes added | ✅ |
| — | §8 Q1 (tenant-migrate.test.ts) and Q5 (overlap pre-flight script) resolved | ✅ |
| — | 33 HIGH/CRITICAL inline annotations added to Phase 2-3 agent sections | ✅ |

---

## Remaining Decisions Required Before Agent Dispatch

| # | Decision | Owner | Blocks |
|---|----------|-------|--------|
| D1 | Cursor pagination vs offset/limit for new list endpoints | Architect | All Phase 2 list procs |
| D2 | Stock movements: partition or regular table? (Q2 still open) | Architect | Agent 2.6 |
| D3 | `payout_batches.totals`: stored+lock or computed at query? | Architect | Agent 2.5 |
| D4 | Auto-resume cron frequency (15min? hourly? daily?) | Product | Agent 3.1 |
| D5 | Create `cache.utility.ts` LRU helper before or as part of Agents 2.2/2.3? | Tech Lead | Agents 2.2, 2.3 |

---

## Remaining Mechanical Fixes (apply now without decisions)

| # | Fix | Location |
|---|-----|----------|
| MF1 | Renumber all agent migration filenames 0021+ per mapping in schema-drift.md | All agent owner-files sections in plan.md |
| MF2 | Standardize error mapper path to `apps/server/src/lib/orpc-error-mapper.ts` | Agent 2.4 owner-files |
| MF3 | Agent 3.2 owner-files: `customers.ts` → `customer-profiles.ts` | Plan §5 Agent 3.2 |
| MF4 | Agent 2.5 owner-files: `commission.service.ts` → 3 real service files | Plan §5 Agent 2.5 |
| MF5 | Add `pricing.test.ts` to Agent 2.2 owner-files | Plan §5 Agent 2.2 |
| MF6 | Add `status-history.test.ts` to Agent 2.7 owner-files | Plan §5 Agent 2.7 |
| MF7 | Add `stock-movements.test.ts` to Agent 2.6 owner-files | Plan §5 Agent 2.6 |
| MF8 | Add `commission-versioning.test.ts` to Agent 2.5 owner-files | Plan §5 Agent 2.5 |
| MF9 | Add `refund-items.test.ts` to Agent 2.8 owner-files | Plan §5 Agent 2.8 |
| MF10 | Fix `updatedMember!` assertion → explicit null check | `packages/api/src/routers/members.ts:512-517` |
| MF11 | Agent 2.8 brief: redesign `creditsRemaining` decrement (increment `credits_used`, not write generated col) | Plan §5 Agent 2.8 |

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| MF1 — renumber filenames in plan | 1 (plan.md) | 600–800 | ~20 occurrences, mechanical per mapping |
| MF2–MF4 — path/name corrections | 1 (plan.md) | 200–300 | 3 targeted agent section edits |
| MF5–MF9 — add test files to owner-files | 1 (plan.md) | 300–400 | 5 agent sections, one line each |
| MF10 — fix non-null assertion | 1 (members.ts) | 100–150 | 3-line change |
| MF11 — redesign Agent 2.8 concurrency | 1 (plan.md) | 400–600 | Rewrite Agent 2.8 decrement section |
| D1–D5 decisions | — | — | Human judgment required |
| **Total mechanical** | **2 files** | **~1,600–2,250** | |

---

## Priority Fix Order

### P1 — Critical (block execution — fix before any /execute)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| C1 | schema-drift | Migration numbers 0009-0020 all consumed by prior feature work | `packages/db/src/migrations/tenant/*.sql` | Renumber all plan migrations to 0021+; Task 1.2 (preferred_trainer_id) already done at 0019 — change to validation task |
| C2 | api-surface | `memberships.ts` router does not exist — J4 blocked | `packages/api/src/routers/` | Agent 3.1 creates from scratch + registers in baseRouter |
| C3 | api-surface | `households.ts` router does not exist | `packages/api/src/routers/` | Agent 3.6 creates from scratch + registers in baseRouter |
| C4 | api-surface | `inventory.ts` router does not exist — J6 blocked | `packages/api/src/routers/` | Agent 2.6 creates from scratch + registers in baseRouter |
| C5 | api-surface | `refunds.createPartial` procedure missing — J5 blocked | `packages/api/src/routers/refunds.ts` | Agent 2.8 adds `createPartial: protectedProcedure` |
| C6 | api-surface | `walk-in-customers.convertToPackage` missing | `packages/api/src/routers/walk-in-customers.ts:12-13` | Agent 3.5 adds `convertToPackage: protectedProcedure` |
| C7 | test-coverage | Phase 0 migration runner has zero integration test | Plan Phase 0 — no test file listed | Add `tenant-migrate.test.ts` to Phase 0 owner files |
| C8 | test-coverage | Plan names 3 test files that don't exist (`members.test.ts`, `sales-tax.test.ts`, `appointment-overlap.test.ts`) | Plan §5 Agents 2.1, 2.3, 2.4 owner files | Agents create these files from scratch |
| C9 | test-coverage | Phase 3 test coverage model undefined; J4 auto-resume cron untested | Plan §5 Phase 3 section | Clarify per-agent test requirement; add `membership-holds.test.ts` |
| C10 | doc-consistency | Phase 0 core files don't exist: `tenant-migrate.ts`, `migrations/tenant/` | `apps/server/src/lib/`, `packages/db/src/migrations/` | Phase 0 scope is create-from-scratch; update task wording from "rewrite" to "create" |
| C11 | type-safety | Unsafe `any` cast in `hierarchy.ts` getControlPanelDb — fails `bun check-types` strict | `packages/api/src/routers/hierarchy.ts:28-30` | Define typed HonoContext interface; replace `any` cast |

