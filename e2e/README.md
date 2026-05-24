# E2E tests (Playwright)

Playwright specs live in two trees:

| Location | Purpose |
|----------|---------|
| `e2e/` (repo root) | Journey specs, dashboard batches, smoke |
| `apps/web/e2e/tests/` | GHL sync, platform-admin ship plans, smokes |

## Prerequisites

1. Dev stack running on **3021 / 3020** with **`avantej.localhost`** (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
2. Server env in `apps/server/.dev.vars` (Neon `DATABASE_URL`, `ENCRYPTION_KEY`, etc.).

```bash
bun dev          # or bun dev:web + bun dev:server
```

## Credentials

| Role | Email | Password |
|------|-------|------------|
| Tenant admin | `franchisee@gmail.com` | `password123` |
| Control panel | `developer.avantej@gmail.com` | `password1234` |

Seeded fixtures (deterministic trainer/client/service): run `cd apps/server && bun run scripts/seed-business-data.ts` — see `docs/testing/_setup.md`.

## Run

```bash
# From repo root — uses root playwright.config.ts
bunx playwright test

# Single file
bunx playwright test e2e/smoke.spec.ts

# Web app config
cd apps/web && bunx playwright test
```

## Smoke vs journey

| Type | Examples | CI target (Plan B) |
|------|----------|-------------------|
| **Smoke** | `e2e/smoke.spec.ts`, `e2e/fixes-verification.spec.ts` | Required on PR |
| **Journey** | `e2e/*.journey.spec.ts` | Nightly (Plan B) |

`e2e/smoke.spec.ts` is extended in Plan B with deterministic seeding — today it only asserts dashboard loads when auth state exists.

## Plan B: `ci-fixture` org

CI uses the **development Neon database** (not a separate ci-e2e project). All automated writes should target org slug `ci-fixture` with IDs prefixed `ci-smoke-`. See `zplan/05-23_20-00_quality-9-roadmap/overview.md` §Dev Neon CI safety rules.

GitHub secrets (Plan B): `CI_DATABASE_URL`, `CI_TENANT_DATABASE_URL`, `ENCRYPTION_KEY`.

## Auth setup

Root config may use `e2e/auth.setup.ts` for stored session state. Check `playwright.config.ts` for `projects` and `dependencies`.
