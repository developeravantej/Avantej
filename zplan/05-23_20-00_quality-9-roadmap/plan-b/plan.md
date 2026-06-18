# Plan B — E2E Smoke Green + Dev Neon CI

**Session:** `05-23_20-00_quality-9-roadmap`  
**Depends on:** Plan A (server unit + build in CI)  
**Blocks:** **Plan C entirely** (decision D1)  
**Dimensions lifted:** Tests (8→8.5), CI (7.5→8.5)

---

## 1. Problem

~70 Playwright specs exist but none run in CI. Journey specs use conditional `test.skip()` when franchise tenant lacks trainers/products/packages. Playwright configs assume macOS paths or wrong ports (`localhost:3001` vs dev `3021`). Program cannot safely enforce SaaS middleware without a green smoke gate.

---

## 2. Goals

1. **Deterministic E2E fixture** on dev Neon — smoke specs never skip for missing data.
2. **`e2e-smoke` GitHub Actions job** — 5–10 stable specs on every PR; uses **development Neon** (D3).
3. **Server integration tests** on push to `main` (and optional nightly) against same dev DB with `ci-fixture` org isolation.
4. Fix unconditional Playwright skips and Linux CI `webServer` boot.

---

## 3. Success criteria — **PLAN B EXIT GATE (unblocks Plan C)**

- [ ] `e2e-smoke` job required on PR to `main`/`dev` — **green 3 consecutive merges** without skip hacks
- [ ] Smoke suite ≤10 specs, runtime <15 min, zero conditional skips for data absence
- [ ] `seedMinimalPosFixture()` (or equivalent) documented in `e2e/README.md`
- [ ] `ci-fixture` org exists in dev control-panel DB with known credentials
- [ ] GitHub secrets configured: `CI_DATABASE_URL`, `CI_TENANT_DATABASE_URL`, `ENCRYPTION_KEY`
- [ ] Integration job on push `main`: `cd apps/server && bun test:integration` passes (may allow `shouldSkipIntegration` only when secrets missing — not in prod CI)

**Explicit gate rule:** Do **not** open Plan C PRs until a human marks Plan B exit gate complete in this file (checkbox + date).

---

## 4. Dev Neon setup (D3)

### 4.1 One-time provisioning (local script or manual)

| Step | Action |
|------|--------|
| 1 | In dev control-panel DB: ensure org slug `ci-fixture` exists (or reuse franchisee org if stable — prefer dedicated org) |
| 2 | Record tenant branch connection string → `CI_TENANT_DATABASE_URL` secret |
| 3 | Control-panel URL → `CI_DATABASE_URL` (same as developer `DATABASE_URL`) |
| 4 | Copy `ENCRYPTION_KEY` from `apps/server/.dev.vars` |
| 5 | Create CI test user: `ci-smoke@avantej.local` / rotatable password in GitHub secret `CI_E2E_PASSWORD` |

### 4.2 Fixture contract

File: `e2e/helpers/seed-data.ts` (extend)

```typescript
// Stable IDs — upsert, never blind delete franchise data
export async function seedMinimalPosFixture(orgId: string): Promise<{
  trainerId: string;
  clientMemberId: string;
  packageServiceId: string;
  installmentPlanId: string;
}>;
```

- All writes under `ci-fixture` org only
- Use oRPC client from `e2e/helpers/orpc-client.ts`
- `afterAll` cleanup: delete rows created with prefix `ci-smoke-` only

---

## 5. Tasks

### B.1 — Fix Playwright CI readiness

| ID | Task | Files | Effort |
|----|------|-------|--------|
| B.1.1 | Linux-safe webServer | Root `playwright.config.ts`, `apps/web/playwright.config.ts` — remove macOS-only paths; use `bun` from PATH | M |
| B.1.2 | Port alignment | Base URL `http://avantej.localhost:3021` or CI `localhost:3021` with `/etc/hosts` in Actions | S |
| B.1.3 | Env injection in CI | Pass secrets via job `env`; document mapping to server `.dev.vars` equivalents | S |
| B.1.4 | `playwright install chromium --with-deps` in workflow | Standard GH Actions step | S |

### B.2 — Deterministic seed

| ID | Task | Effort |
|----|------|--------|
| B.2.1 | Implement `seedMinimalPosFixture` | L |
| B.2.2 | Refactor 3 journey specs to use fixture (remove `test.skip` data checks) | M |
| B.2.3 | Add `e2e/smoke.spec.ts` orchestration spec calling seed + login + one dashboard load | M |

### B.3 — Un-skip broken specs

| ID | File | Action | Effort |
|----|------|--------|--------|
| B.3.1 | `apps/web/e2e/tests/96-refund-smoke.spec.ts` | Remove bare `test.skip()`; use seed paid appointment | S |
| B.3.2 | `e2e/batch2.dashboard.spec.ts` | Replace bare skips with fixture or delete obsolete cases | S |
| B.3.3 | `apps/web/e2e/tests/ship/plan-f-6/Sn-snapshot-factors.spec.ts` | Implement or move to nightly-only folder | S |
| B.3.4 | `apps/web/e2e/tests/ship/plan-f-6/Fo-feature-overrides.spec.ts` | Same | S |

### B.4 — Smoke CI workflow

New file: `.github/workflows/e2e-smoke.yml`

| ID | Task | Effort |
|----|------|--------|
| B.4.1 | Job: checkout, bun, playwright, seed env, `bun dev:web` + `bun dev:server` background OR composite action | L |
| B.4.2 | Run: `bunx playwright test e2e/smoke.spec.ts e2e/fixes-verification.spec.ts` (+ 1 login spec) | M |
| B.4.3 | Upload trace on failure | S |
| B.4.4 | Add to branch protection required checks | S |

**Suggested smoke set (max 10):**

1. `e2e/smoke.spec.ts` — seed + health
2. `e2e/fixes-verification.spec.ts` — existing
3. `apps/web/e2e/tests/09-org-shared-smoke.spec.ts`
4. `apps/web/e2e/tests/98-connect-onboarding-smoke.spec.ts` (if stable without real Stripe)
5. Auth login spec (franchisee or ci-smoke user)

### B.5 — Server integration on main

New file: `.github/workflows/integration.yml`

| Trigger | `push` to `main`, `workflow_dispatch`, optional `cron: '0 6 * * *'` |
|---------|---------------------------------------------------------------------|
| Env | `DATABASE_URL: ${{ secrets.CI_DATABASE_URL }}`, tenant URL, `ENCRYPTION_KEY` |
| Command | `cd apps/server && bun test:integration` |
| Gate | Required on `main` push; advisory on schedule |

### B.6 — CI polish (from audit)

| ID | Task | Effort |
|----|------|--------|
| B.6.1 | Dependabot `.github/dependabot.yml` | S |
| B.6.2 | `react-doctor.yml`: `fail-on: error` | S |
| B.6.3 | Native `check-types` in `apps/native/package.json` + turbo | S |
| B.6.4 | Biome format-only check job (optional) | S |

---

## 6. Nightly (non-blocking)

| Job | Specs | Purpose |
|-----|-------|---------|
| `e2e-full.yml` | Root `e2e/*.journey.spec.ts` + ship folder | Catch regressions; alert only |

Not required for Plan B exit gate.

---

## 7. Verification

```bash
# Local smoke dry-run (dev Neon)
cd apps/server && bun dev &
cd apps/web && bun dev &
bunx playwright test e2e/smoke.spec.ts --project=chromium

# Integration (requires real DB)
cd apps/server && bun test:integration
```

---

## 8. Risks (dev Neon)

| Risk | Mitigation |
|------|------------|
| CI pollutes manual dev data | Strict `ci-fixture` org + prefixed IDs |
| Parallel PR collisions | Namespace fixtures with `GITHUB_RUN_ID` |
| Flaky server boot in CI | Health poll on `:3020/health` before tests |
| Integration tests slow | Path-filter or main-only; not every PR |

---

## 9. Exit gate sign-off

| Field | Value |
|-------|-------|
| Gate passed | ☐ |
| Date | |
| Signed off by | |
| Notes | |

**When gate passed → start Plan C.**
