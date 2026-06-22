# Deferred Work

Multi-day efforts that were intentionally deferred because each warrants its own focused planning + implementation session.

Each file in this folder is a self-contained brief: scope, why it was deferred, schema/API sketch, and acceptance criteria. They can be picked up in any order.

> Cleared 2026-05-29. Prior briefs (announcements read-receipts, NPS, messaging, per-line refund clawback, and the audit-prove follow-up sets) were removed on request; they remain recoverable from git history if needed.

## Index

| File | Feature | Estimated effort |
|---|---|---|
| `apps-server-router-modularization-and-tests.md` | Split the ~14 oversized `apps/server` routers into folder-modules (admin 1047, customer-profiles 972, payments 922, …) — ungated by CI today — and add unit tests for the high-value untested routers (~4/33 covered) | 3–7 days |
| `web-god-component-extraction.md` | Extract the remaining 1,000+ line `apps/web` components into `features/*` modules. Includes the proven 2026-05-29 recipe (sales/view, approvals, refunds done); flags the 3 monolithic ones (pos-workflow, members-tab, class-slots) that need a dedicated hook-extraction plan | 2–6 days |
| `audit-prove-remediation-followups.md` | Loose ends from the 2026-05-29 `/audit-prove` remediation (branch `audit-prove/remediation-20260529-1240`, 3 commits, unpushed). Code done + verified; remaining = 3 product sign-offs (incl. commission separation-of-duties), tenant-migration rollout (0079–0081), pre-existing drift cleanup, test-harness convergence, PR finalization | 0.5–2 days |
| `integration-suite-bun-db-stabilization.md` | `apps/server` integration suite (branch `fix/integration-suite-hang`). Global hang + DB isolation + pg-driver migration + per-file isolated runner DONE (suite now completes). Remaining: a bun:test×Drizzle transaction-rollback wedge (6 timeout files — proper fix = run DB suite under Node), 3 commission-domain test failures (likely stale vs refactored engine), and fixture work (supplier/branch FK rows, version trigger, Resend mock) | 2–5 days |
| `e2e-deep-remaining-coverage.md` | Tail of `/e2e-deep` (branch `test/unit-suite-green-and-ci-fix`, 12 commits unpushed). Coverage ledger 235/241; 2 real bugs fixed (cancellation-number reuse, neon `getWorkersEnv` cache). Remaining 6 rows: multi-tenant 3 + saas suspended 1 (verified green vs a real org B, re-defer on teardown — need a standing 2nd tenant), saas past_due 1 (needs a `saas_subscriptions` past-grace fixture), payment invoice 1 (needs a backend procedure). Plus: run full suite via `shard-run.sh` to dodge dev-server death | 0.5–2 days |
| `legacy-onboarding-migration-pipeline.md` | Reusable config-driven ETL for migrating a gym client's legacy 8-tab export into an Avantej tenant (`apps/server/scripts/migration/`). 6/8 loaders built + dry-run-verified green (location, staff, product, client, appointment + manager pass); architecture proven. Remaining 3 (sales, package, redemption) BLOCKED on: client re-export (CL-xxx↔client_id key mismatch, blank package product_id), historical commission amounts, multi-currency hardening, and a new `coach_session_claims` table | 3–8 days (gated on client) |

## Conventions for these briefs

Each brief follows the same shape:
1. **Problem** — what stub or capability is missing today
2. **Why deferred** — what makes it larger than a Tier 2 backend extension
3. **Scope** — files, tables, procedures expected to land
4. **Out of scope** — explicit non-goals
5. **Acceptance criteria** — concrete signals the work is done

When a brief is implemented, move it from this folder to `docs/features/` (or delete it if no historical value).
