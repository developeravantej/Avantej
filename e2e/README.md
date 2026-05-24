# E2E tests (Playwright)

Playwright specs live in two trees:

| Location | Purpose |
|----------|---------|
| `e2e/` (repo root) | Journey specs, dashboard batches, smoke |
| `apps/web/e2e/tests/` | GHL sync, platform-admin ship plans, smokes |

## Prerequisites

1. Dev stack on **3021 / 3020** — local dev uses `avantej.localhost`; CI uses `localhost:3021` (vite proxy to server).
2. Server env in `apps/server/.dev.vars` (Neon `DATABASE_URL`, `ENCRYPTION_KEY`, etc.).

```bash
bun dev          # or bun dev:web + bun dev:server
```

## Credentials

| Role | Email | Password |
|------|-------|----------|
| Tenant admin (default) | `franchisee@gmail.com` | `password123` |
| CI override | `CI_E2E_EMAIL` secret | `CI_E2E_PASSWORD` secret |
| Control panel | `developer.avantej@gmail.com` | `password1234` |

## Seed fixture

Idempotent business data for the franchise test org:

```bash
cd apps/server && bun run scripts/seed-business-data.ts
```

Smoke specs call `seedMinimalPosFixture()` in `e2e/helpers/seed-data.ts` — it **throws** (never silently skips) if trainer, client, package service, or installment plan is missing. Run the seed script above first.

## Run

```bash
# Smoke only (auth setup + chromium project)
bun run e2e:smoke

# Full root suite
bunx playwright test

# Web app config (ship / platform-admin specs)
cd apps/web && bunx playwright test
```

Environment overrides:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3021` | Web app origin |
| `PLAYWRIGHT_SERVER_URL` | `http://localhost:3020` | Server health / direct RPC |
| `E2E_EMAIL` / `E2E_PASSWORD` | franchisee creds | Auth setup project |

## CI (Plan B)

Workflow: `.github/workflows/e2e-smoke.yml`

1. Writes `apps/server/.dev.vars` via `scripts/ci/write-server-dev-vars.mjs`
2. Runs `seed-business-data.ts`
3. Boots web + server via Playwright `webServer` (port 3021 / 3020)
4. Runs `e2e/smoke.spec.ts` + `e2e/fixes-verification.spec.ts`

### GitHub secrets

| Secret | Maps to |
|--------|---------|
| `CI_DATABASE_URL` | Control-panel Neon URL |
| `CI_TENANT_DATABASE_URL` | Optional; integration tests + tenant scripts |
| `ENCRYPTION_KEY` | Tenant connection-string encryption |
| `CI_E2E_EMAIL` / `CI_E2E_PASSWORD` | Optional; default franchisee creds |

Integration tests on push to `main`: `.github/workflows/integration.yml`.

## Smoke vs journey

| Type | Examples | CI |
|------|----------|-----|
| **Smoke** | `e2e/smoke.spec.ts`, `e2e/fixes-verification.spec.ts` | Required on PR (`e2e-smoke`) |
| **Journey** | `e2e/*.journey.spec.ts` | Nightly (future `e2e-full.yml`) |

## Auth setup

Root config uses `e2e/auth.setup.ts` → `e2e/.auth/tenant-admin.json`. The `chromium` project depends on `setup` and reuses stored session state.
