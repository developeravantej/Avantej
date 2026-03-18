# GoHighLevel Webhook Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement v1 GoHighLevel custom webhook sync (create/update/delete with soft-delete and event logging) plus a frontend demo page that proves webhook-to-backend-to-frontend flow.

**Architecture:** Add a provider-specific webhook route under `/webhooks/gohighlevel/:locationId` that resolves tenant/org from a control-panel location mapping table, writes idempotent sync events, and upserts customer/link records in tenant DB. Add read endpoints for demo UI and a simple authenticated frontend page to display locations, links, and recent sync events.

**Tech Stack:** Hono, Drizzle ORM, Neon Postgres (control-panel + tenant DBs), TanStack Router + React, Bun test.

---

### Task 1: Add database schemas for GHL integration

**Files:**
- Create: `packages/db/src/schema/control-panel/ghl-location-links.ts`
- Create: `packages/db/src/schema/tenant/ghl-contact-links.ts`
- Create: `packages/db/src/schema/tenant/ghl-sync-events.ts`
- Modify: `packages/db/src/schema/control-panel/index.ts`
- Modify: `packages/db/src/schema/tenant/index.ts`
- Modify: `packages/db/src/schema/tenant/customer-profiles.ts`

**Step 1: Write failing type-level checks via server tests**

- Add/extend unit tests to import new schema exports and ensure expected fields are available.

**Step 2: Run tests and verify RED**

Run: `bun test apps/server/src/services/gohighlevel.service.test.ts`  
Expected: FAIL due missing schema/types/functions.

**Step 3: Implement minimal schema updates**

- Add 3 new tables and customer profile soft-delete fields.
- Export them in schema index files.

**Step 4: Re-run tests and verify GREEN**

Run: `bun test apps/server/src/services/gohighlevel.service.test.ts`

---

### Task 2: Generate and align migrations

**Files:**
- Modify/Create: `packages/db/src/migrations/control-panel/*`
- Modify/Create: `packages/db/src/migrations/control-panel/meta/*`
- Modify/Create: `packages/db/src/migrations/tenant/*`
- Modify/Create: `packages/db/src/migrations/tenant/meta/*`
- Modify: `packages/db/src/migrate-tenant.ts`

**Step 1: Generate migrations (RED path for runtime migration)**

- Ensure runtime tenant migration runner lacks new SQL first.

**Step 2: Generate migration files**

Run:
- `bunx drizzle-kit generate --config=drizzle.control-panel.config.ts`
- `bunx drizzle-kit generate --config=drizzle.tenant.config.ts`

**Step 3: Update embedded tenant migration runner**

- Add next migration constant with SQL for new tenant tables + soft-delete columns.
- Update migration list and latest version hash.

**Step 4: Validate migrations compile**

Run: `bun run -F @avantej-core/db build`

---

### Task 3: Implement GHL sync service with idempotency

**Files:**
- Create: `apps/server/src/services/gohighlevel.service.ts`
- Create: `apps/server/src/services/gohighlevel.service.test.ts`

**Step 1: Write failing tests**

- Required-field validation (`contact.id`, `email`)
- Event key generation stability
- Event type parsing (update/delete/custom)
- Payload extraction across selected-field shapes

**Step 2: Run tests to verify RED**

Run: `bun test apps/server/src/services/gohighlevel.service.test.ts`

**Step 3: Implement minimal service**

- Payload extraction helpers
- Event key generation
- Signature verification helper (optional by config)
- Sync orchestration helpers for create/update/delete semantics

**Step 4: Re-run tests for GREEN**

Run: `bun test apps/server/src/services/gohighlevel.service.test.ts`

---

### Task 4: Implement webhook routes for write and demo-read APIs

**Files:**
- Modify: `apps/server/src/routes/webhooks.routes.ts`

**Step 1: Write failing route tests or service-invocation tests**

- Validate 400 on missing email/contact id
- Validate dedupe path returns success without duplicate writes (unit-level with mocks)

**Step 2: Run tests to verify RED**

Run: `bun test apps/server/src/services/gohighlevel.service.test.ts`

**Step 3: Implement route handlers**

- `POST /webhooks/gohighlevel/:locationId`
- `GET /webhooks/gohighlevel/locations` (auth)
- `GET /webhooks/gohighlevel/:locationId/events` (auth)
- `GET /webhooks/gohighlevel/:locationId/links` (auth)

**Step 4: Re-run tests**

Run:
- `bun test apps/server/src/services/gohighlevel.service.test.ts`
- `bun run -F server check-types`

---

### Task 5: Build frontend demo page

**Files:**
- Create: `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx`
- Modify: `apps/web/src/components/app-sidebar.tsx`
- Modify (generated): `apps/web/src/routeTree.gen.ts` (if regenerated)

**Step 1: Add failing check-types expectation (route missing)**

Run: `bun run -F web check-types`
Expected: FAIL before route/sidebar wiring.

**Step 2: Implement minimal page**

- Fetch locations/events/links from server endpoints
- Display simple cards/tables and status chips
- Include test instructions and required-field reminder

**Step 3: Re-run web typecheck/build**

Run:
- `bun run -F web check-types`
- `bun run -F web build`

---

### Task 6: Verification and git hygiene

**Files:**
- Modify: `docs/plans/2026-02-07-gohighlevel-webhook-sync-implementation.md` (optional verification notes)

**Step 1: Run scoped verification commands**

Run:
- `bun test apps/server/src/services/gohighlevel.service.test.ts`
- `bun run -F server check-types`
- `bun run -F web check-types`

**Step 2: Review diff for unintended changes**

Run: `git status --short`

**Step 3: Commit implementation**

```bash
git add <changed-files>
git commit -m "feat: add GoHighLevel webhook sync and integration demo page"
```

