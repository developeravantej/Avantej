# Web Maturity Remediation — Orchestration Index

**Session:** 2026-07-12_web-maturity-remediation
**Source:** 8-agent maturity/coverage audit of `apps/web` (2026-07-12). Domains excluded by owner decision: **Inventory/Retail** and **Auth/Public** (incl. landing/marketing, subscribe, login flows).

## Plans (one agent each, parallel-safe)

| # | Plan | Focus | Risk level |
|---|------|-------|-----------|
| 1 | [plan-1-pos-sales.md](plan-1-pos-sales.md) | Dead UI fixes + refunds/payment-proof unit tests + approvals e2e | Medium (touches live POS page) |
| 2 | [plan-2-members-packages.md](plan-2-members-packages.md) | Legacy customers page removal + type-cast fixes + canWrite | Medium (route deletion) |
| 3 | [plan-3-scheduling-services.md](plan-3-scheduling-services.md) | Legacy service-category consolidation + onSaved no-op + unit tests | Low-Medium |
| 4 | [plan-4-money-ops.md](plan-4-money-ops.md) | Payouts e2e + payroll tests/prompt-dialog + money unit tests | High value, low code risk |
| 5 | [plan-5-admin-settings.md](plan-5-admin-settings.md) | Email-domains e2e + admin unit tests + dead bulk-actions menu | Low-Medium |
| 6 | [plan-6-platform-admin.md](plan-6-platform-admin.md) | Platform-admins e2e + payments-integrity e2e + PA unit tests | Medium (privileged ops) |
| 7 | [plan-7-shared-hygiene.md](plan-7-shared-hygiene.md) | vitest glob fix, skipped suites, orphaned test | Low — **owns shared config** |

## File-ownership contract (CRITICAL for parallel execution)

- **`apps/web/vitest.config.ts` is owned EXCLUSIVELY by Plan 7.** No other agent may edit it. If your new test file isn't picked up, place it under `apps/web/src/__tests__/**` or `apps/web/src/features/**` (the existing include globs) — do NOT widen the globs yourself.
- **`apps/web/src/components/app-sidebar.tsx` is owned by Plan 2** (legacy customers link removal). No other plan touches it.
- **`apps/web/src/routes/_authenticated/dashboard/_layout/sales/view.tsx` is owned by Plan 1.**
- No two plans own the same file. Each plan lists its owned files; if an agent finds it must edit a file outside its list, it must STOP and report back instead of editing.
- New e2e specs go in each plan's own new `_e2e/web/<module>/` folder — no collisions.

## Shared conventions every agent must follow

1. **Web unit tests:** run with `bun run test` from `apps/web` (vitest) — NOT `bun test` (that invokes Bun's runner and fails).
2. **Mocking oRPC:** every `vi.mock("@/utils/orpc")` must return BOTH `client` AND `orpc` (built via `createTanstackQueryUtils`). Copy the pattern from an existing test, e.g. `apps/web/src/__tests__/pages/sales-view.test.tsx`.
3. **E2E specs** follow the `_e2e/web/<module>/` conventions: `smoke.spec.ts`, `<name>.lifecycle.spec.ts`, `<name>.rule.spec.ts`, `<name>.rbac.spec.ts`. Use conditional `test.skip(cond, reason)` guards when seed data is missing (established pattern). API-driven assertions go through `page.request` to `/rpc/<router>/<procedure>` with body `{"json":{...}}`.
4. **Radix Select cannot be browser-automated** (isTrusted check) — drive those flows via API calls in e2e, not UI clicks.
5. **If a plan requires a NEW server procedure** (touches `packages/api`): rebuild `packages/services` THEN `packages/api` before web type-check, or new procedure output types will be `any`. Folder-module routers must import builders from `"../../index"` not `"../index"`.
6. **Never `git stash` / `git reset`.** Concurrent sessions share this working tree — do not revert files you didn't change.
7. Type-check gate after each plan: `bun check-types` from repo root. Lint: `bun check`.

## Recommended execution order

All 7 plans are parallel-safe under the ownership contract. If running sequentially, do 7 → 4 → 1 → 2 → 3 → 5 → 6 (hygiene first so new tests land in working globs; money ops next for risk value).

## Global verification (after all plans complete)

1. `bun check-types` and `bun check` from repo root — zero new errors.
2. `cd apps/web && bun run test` — all unit tests green, count strictly higher than baseline (85 files).
3. Targeted e2e: run each new `_e2e/web/<module>/` spec folder individually (see project memory `project_e2e_local_run_setup` for local run prerequisites).
4. Browser spot-check at `http://avantej.localhost:3021/`: sales page (export + payment select), customers v2, trainer availability intake save, payroll unlock dialog.
