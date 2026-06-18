# Contributing

This guide gets a new developer from clone → working dev environment in ~10 minutes.

## Prerequisites

- **Bun** 1.3+ (`curl -fsSL https://bun.sh/install | bash`)
- **Git** with line-ending config (`git config core.autocrlf input` on Windows)
- **A Neon account** for control-panel + tenant databases (https://console.neon.tech)
- **A Resend account** if you need to test invitation/password/scheduled-report emails (https://resend.com)

## Quick start

```bash
git clone <repo>
cd Avantej
bun install
```

### Configure environment

1. Copy templates:
   ```bash
   cp apps/web/.env.example apps/web/.env
   cp apps/server/.dev.vars.example apps/server/.dev.vars
   ```
2. Fill in the placeholders in `apps/server/.dev.vars` (Neon `DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.). The example file has comments explaining each value.
3. **Leave `VITE_SERVER_URL` unset in `apps/web/.env`.** See "Dev setup → the avantej.localhost convention" below for why.

### Run

```bash
bun dev          # starts both apps:  web → 3021, server → 3020
bun dev:web      # web only
bun dev:server   # server only (wrangler dev)
```

Open http://avantej.localhost:3021 — note the **`avantej.`** prefix.

## Dev setup

### Ports

| App | Port | URL |
|---|---|---|
| Web (Vite + TanStack Router) | 3021 | http://avantej.localhost:3021 |
| Server (Cloudflare Workers via wrangler) | 3020 | http://avantej.localhost:3020 |

Ports are pinned to **3020/3021** rather than the more common 3000/3001 to avoid clashing with other projects you might be running. If you change them, also update `BETTER_AUTH_URL`, `CORS_ORIGIN`, `WEB_APP_URL` in `.dev.vars` to keep auth happy.

### The `avantej.localhost` convention

Both apps run on `avantej.localhost` (not plain `localhost`). Modern browsers automatically route `*.localhost` to `127.0.0.1` per RFC 6761, so **no `/etc/hosts` edit is needed**.

**Why a subdomain instead of plain localhost?**

Browsers scope cookies by **domain**, not by port. If two different projects run on `localhost:3020` and `localhost:4000`, they share the same cookie jar — logging in to one logs you out of the other, and stale session cookies from yesterday's project can break auth in today's project. Using a unique hostname per project (`avantej.localhost`, `other-project.localhost`) gives each project its own cookie scope.

### Why `VITE_SERVER_URL` must stay unset locally

Better-Auth's client and our oRPC client both read `VITE_SERVER_URL` to decide where to send API calls. If you set it to `http://localhost:3020` while the web app runs on `http://avantej.localhost:3021`, every API call becomes **cross-site** (`localhost` ≠ `avantej.localhost`), and `SameSite=Lax` cookies are blocked.

Leaving `VITE_SERVER_URL` **unset** makes both clients fall back to `window.location.origin` — so requests go to `avantej.localhost:3021/rpc`, get same-site cookies attached, then are proxied by Vite to the actual server at `avantej.localhost:3020`. See `apps/web/vite.config.ts` for the proxy rules.

### First-time auth troubleshooting

If you hit a redirect loop or "no organizations" after login:

1. **Check the URL bar** — make sure you're on `avantej.localhost:3021`, not `localhost:3021`.
2. **Clear the cookie jar** for `avantej.localhost` in DevTools → Application → Cookies.
3. **Confirm `VITE_SERVER_URL` is empty/unset** in `apps/web/.env`. If it's set to `http://localhost:3020`, remove it and restart `bun dev`.
4. **Confirm `BETTER_AUTH_URL` and `CORS_ORIGIN` use `avantej.localhost`** in `apps/server/.dev.vars`, not plain `localhost`.

## Daily commands

```bash
# Quality gates — run these before pushing
bun check-types     # tsc -b across the monorepo
bun check           # oxlint (NOT Biome — Biome handles formatting only)
cd apps/server && bun test:unit
cd apps/web && bun test --run
bun build           # optional locally; required in CI

# Database
bun db:push                    # push control-panel schema (dev only, never tenants)
bun db:studio                  # open Drizzle Studio
bun gen:migrations             # regenerate generated/tenant-migrations.generated.ts
bun verify:migrations          # confirm generated matches SQL files

# Tenant migrations live in packages/db/src/migrations/tenant/NNNN_*.sql
# Always commit both the new SQL file AND the regenerated *.generated.ts in
# the same PR. See docs/TENANT_MIGRATION_WORKFLOW.md.
```

## CI (GitHub Actions)

Pull requests to `main` / `dev` run:

| Job | Command |
|-----|---------|
| Type Check | `bun check-types` |
| Lint | `bun check` (oxlint) |
| Web Tests | `bun --cwd apps/web test --run` |
| Server Unit Tests | `cd apps/server && bun test:unit` |
| Package Tests | `bun test` in `packages/{types,services,api,db}` |
| Build | `bun build` |
| E2E Smoke | `bunx playwright test e2e/smoke.spec.ts e2e/fixes-verification.spec.ts` (requires secrets) |

Push to `main` also runs **Server Integration** (`cd apps/server && bun test:integration`) and a **nightly full E2E** journey suite (`e2e-full.yml`, advisory).

### GitHub secrets (E2E + integration)

| Secret | Purpose |
|--------|---------|
| `CI_DATABASE_URL` | Dev Neon control-panel URL (same as local `DATABASE_URL`) |
| `CI_TENANT_DATABASE_URL` | Optional tenant branch URL for integration tests |
| `ENCRYPTION_KEY` | Same 64-char hex key as `apps/server/.dev.vars` |
| `CI_E2E_EMAIL` / `CI_E2E_PASSWORD` | Optional; defaults to franchisee test user |

See `e2e/README.md` for local smoke (`bun run e2e:seed` then `bun run e2e:smoke`).

Enable these as **required checks** in GitHub branch protection (repo settings).

Schema drift (`drift-check.yml`) runs on PRs to `main` and `dev` when DB/server paths change.

## Project conventions

- **TypeScript everywhere.** No `.js`/`.jsx` for new files.
- **Forms:** TanStack Form (`@tanstack/react-form`). React Hook Form is no longer in the codebase — don't re-add it.
- **Validation:** Zod, schema co-located at top of each form file.
- **Server state:** TanStack Query + oRPC client (`@/utils/orpc`). No raw `fetch` for app data.
- **Money:** integer cents at every layer. Use `rmToCents` / `centsToRm` from `@/lib/money` at the UI boundary.
- **Permissions:** Resource:action strings (e.g., `"sales:read"`). Routes use `requirePermission()` in `beforeLoad`; APIs enforce via the service layer. See `packages/services/src/permission.service.ts` for the canonical taxonomy.

## CLAUDE.md

If you're using Claude Code or similar AI tooling, `CLAUDE.md` at the repo root has the project's coding rules and stack constraints — read it first.

## Where to ask questions

- **Architecture / multi-tenancy:** see `CLAUDE.md` (auth/RBAC/context flow) and enumerate routers from `packages/api/src/routers/` (or `graphify-out/graph.json`).
- **Anything else:** ask in `#engineering` on Slack.
