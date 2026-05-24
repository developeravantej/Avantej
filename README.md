# avantej-core

**Start here:** [CONTRIBUTING.md](CONTRIBUTING.md) → [zhub/index.md](zhub/index.md) → [CLAUDE.md](CLAUDE.md)

## Login Credentials

- **Control panel (SaaS platform)**
  - Email: `developer.avantej@gmail.com`
  - Password: `password1234`

- **Tenant (franchise)**
  - Email: `franchisee@gmail.com`
  - Password: `password123`

See `CLAUDE.md` and `CONTRIBUTING.md` for dev URLs (`avantej.localhost:3021` / `:3020`).

## Features

- **TypeScript** — type safety end-to-end
- **TanStack Router** — file-based routing
- **React Native / Expo** — mobile app
- **TailwindCSS + shadcn/ui** — web UI
- **Hono + oRPC** — API on Cloudflare Workers
- **Drizzle + PostgreSQL (Neon)** — multi-tenant databases
- **Better-Auth** — authentication
- **Turborepo + Bun** — monorepo tooling
- **Biome** — formatting only
- **oxlint** — linting (`bun check`)
- **Husky** — pre-commit hooks

## Getting Started

```bash
bun install
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for `.env` / `.dev.vars` setup.

## Database Setup

Multi-tenant: **control-panel** DB (users, orgs, billing) + **tenant** DB per organization (Neon branches).

```bash
bun db:push    # CONTROL-PANEL ONLY — never for tenant schemas
```

Tenant migrations:

```bash
bun gen:migrations
bun verify:migrations
```

See `docs/TENANT_MIGRATION_WORKFLOW.md` and `docs/SCHEMA_CHANGE_WORKFLOW.md`.

## Development

```bash
bun dev          # web :3021 + server :3020
bun dev:web
bun dev:server
bun dev:native
```

- Web: [http://avantej.localhost:3021](http://avantej.localhost:3021)
- API: [http://avantej.localhost:3020](http://avantej.localhost:3020)
- OpenAPI: [http://avantej.localhost:3020/api-reference](http://avantej.localhost:3020/api-reference)

## Testing

```bash
cd apps/server && bun test          # all server tests
cd apps/server && bun test:unit     # unit only (CI gate)
cd apps/web    && bun test --run    # Vitest
bunx playwright test                # e2e (repo root)
```

Package tests: `bun --cwd packages/api test` (also `services`, `types`, `db`).

See [e2e/README.md](e2e/README.md) for Playwright layout.

## Scheduled jobs

Cloudflare Cron Triggers in `apps/server/wrangler.jsonc`:

| Cron | Purpose |
|------|---------|
| `0 * * * *` | Hourly webhook backfill + scheduled reports |
| `0 1 * * *` | Daily tenant-usage snapshot |
| `0 2 * * *` | Daily installment sweep |
| `30 2 * * *` | Daily reconciliation |
| `0 3 * * *` | Daily hard-delete sweeper |
| `0 9 * * *` | Daily onboarding-stuck alert |

## Project Structure

```
avantej-core/
├── apps/
│   ├── web/         # Vite + TanStack Router
│   ├── native/      # Expo
│   └── server/      # Hono + oRPC (Workers)
├── packages/
│   ├── api/         # Shared oRPC routers
│   ├── auth/        # Better-Auth config
│   ├── db/          # Drizzle schemas + migrations
│   ├── services/    # Business logic
│   └── types/       # Shared types
└── zhub/            # Route/API context hub
```

## Scripts

| Command | Purpose |
|---------|---------|
| `bun check-types` | TypeScript across monorepo |
| `bun check` | oxlint |
| `bun build` | Production build (turbo) |
| `bun verify:migrations` | Tenant migration bundle sync |

## Deployment

See [CONTRIBUTING.md](CONTRIBUTING.md) and `apps/server/wrangler.jsonc` for Cloudflare Workers deploy.
