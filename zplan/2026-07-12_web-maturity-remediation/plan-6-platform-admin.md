# Plan 6 — Platform Admin: e2e for privileged operations + first unit tests

**Agent scope:** platform-admin pages (control-panel side). Read [00-orchestration.md](00-orchestration.md) shared conventions first. Test-writing only — no product code changes.

## Goal
Put e2e proof around the two high-privilege, destructive surfaces that have none (platform-admins grant/revoke, payments-integrity reconciliation) and land the first unit tests for the platform-admin area (currently zero).

## User journeys affected
- **Super-admin grants/revokes platform admin:** revoke is destructive and has a self-lockout guard (`PlatformAdminAdminsPage.tsx:162`) that has never been tested.
- **Platform admin runs payment reconciliation / webhook backfill:** manual triggers on `PlatformAdminPaymentsPage.tsx:16-44` with a 30s poll — unproven.
- **Platform admin browses tenants and drills in:** covered by ship-plan e2e already; gets unit-level regression protection here.

## Tasks

### Task 1 — Platform-admins e2e
- New folder: `_e2e/web/platform-admin/` — `admins.lifecycle.spec.ts`:
  - Login as control-panel admin (`developer.avantej@gmail.com` / `password123` — see repo test credentials).
  - Grant platform-admin to a seeded test user → assert in list → revoke → assert removed.
  - **Self-lockout rule spec:** attempt to revoke your own admin → assert blocked by the guard.
  - Drive Radix selects via API per convention 4. Clean up: always revoke the seeded grant even on failure (use `test.afterEach`).

### Task 2 — Payments-integrity e2e
- Same folder: `payments-integrity.rule.spec.ts`:
  - Load overview → trigger `runReconciliationNow` → assert run recorded and status transitions (poll like the page does).
  - `runWebhookBackfillNow`: trigger and assert accepted/queued state. Assert idempotency: second immediate trigger doesn't double-process (read the server procedure first to learn the real invariant — assert what the code guarantees, not assumptions).
  - Gate with conditional `test.skip` if Stripe test keys are absent in the env (established pattern).

### Task 3 — RBAC spec
- `platform-admin.rbac.spec.ts`: a tenant user (`franchisee@gmail.com`) cannot reach platform-admin routes or procedures — assert 403 at the API boundary AND redirect/guard at the route level.

### Task 4 — Unit tests
New files under `apps/web/src/__tests__/`:
- `pages/platform-admin-admins.test.tsx` — list renders; revoke calls `revokePlatformAdmin`; **self-lockout guard disables/blocks revoking own row** (`:162`); add-admin dialog payload.
- `pages/platform-admin-payments.test.tsx` — overview query wiring; both run-now mutations fire; buttons disabled while in flight (30s poll mocked with fake timers).
- `hooks/usePlatformAdminRole.test.tsx` — resolves from mocked `orpc.admin.me`; caches with 5-min stale time; non-admin shape handled.

## Files owned
- New test files above; `_e2e/web/platform-admin/**`

## Risks
- These operations act on the CONTROL-PANEL DB (shared), not a tenant branch — specs must only grant/revoke a purpose-seeded test user, never touch real admin rows (especially `developer.avantej@gmail.com` itself, other than the self-lockout attempt which must FAIL by design).
- Reconciliation triggers real Stripe API calls in some configs — keep the conditional skip guard strict.
- Multi-tenant isolation is the crown-jewel invariant: the RBAC spec doubles as an isolation regression (complements `_e2e/web/multi-tenant/`).

## Verification
1. `cd apps/web && bun run test` — 3 new unit files green.
2. Run `_e2e/web/platform-admin/` specs locally against dev control panel.
3. `bun check-types` clean.
