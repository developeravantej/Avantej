# Plan A — Trust Layer

**Session:** `05-23_20-00_quality-9-roadmap`  
**Depends on:** nothing  
**Blocks:** Plan B (partial — router tests help seed work)  
**Dimensions lifted:** CI (6→7.5), Documentation (sustain 9), Tests (7.5→8 partial)

---

## 0. Before execute

See **`../before-execute.md` §Plan A**. Summary:

- [x] No upstream plan dependency
- [ ] Run `cd apps/server && bun test:unit` locally before merging CI job
- [ ] Add `"test"` scripts to packages (prerequisite for A.1.3)
- [ ] Enable GitHub branch protection after CI jobs land (A.4 — manual in repo settings)

**Status:** executing 2026-05-23

---

## 1. Problem

CI only gates type-check, web Vitest, and oxlint. ~124 server test files and ~70 Playwright specs run locally only. README and testing docs contain factual errors (Biome vs oxlint, wrong ports/passwords). Critical money paths (POS, appointments, payments) lack router-layer tests.

Without Plan A, Plan B smoke work has no regression net.

---

## 2. Goals

1. Every PR to `main`/`dev` runs **server unit tests** and **production build**.
2. Documentation P0 fixes — no contradictions between README, CONTRIBUTING, CLAUDE, and `package.json`.
3. Router tests for POS, appointments, and payments land before E2E seed expansion.
4. CI hygiene: pinned Bun, cache, drift-check on `dev`, package tests.

---

## 3. Success criteria (exit gate)

- [x] `.github/workflows/ci.yml` jobs: `type-check`, `lint`, `web-tests`, `server-unit-tests`, `build`, `package-tests`
- [x] Bun pinned to `1.2.22` in all workflows
- [x] `bun install` cached via `actions/cache`
- [x] `drift-check.yml` triggers on PRs to `dev`
- [x] README + CONTRIBUTING P0 items merged
- [x] `packages/api/src/routers/pos.router.test.ts`, `appointments.router.test.ts`, `apps/server/src/routers/payments.test.ts` exist and pass
- [ ] Branch protection requires Plan A jobs (GitHub settings — manual)

### Execution notes (2026-05-23)

- **`test:unit` scope:** Runs `src/tests/unit/routers`, `middleware`, `lib`, `cron`, plus `payments.test.ts` and `stripe-connect.test.ts` (232 tests). Full `src/tests/unit/services/*` has pre-existing mock drift (e.g. `analytics.test.ts` needs `tenantDb.execute`) — remediate in a follow-up PR before expanding CI scope.
- **GHL staff sync tests:** Fixed missing `organizations` mock for Phase G org lookup.
- **API test isolation:** Fixed `mock.module` pollution in POS/appointments router tests.

---

## 4. Tasks

### A.1 — CI workflow (`ci.yml`)

| ID | Task | Details | Effort |
|----|------|---------|--------|
| A.1.1 | Add `server-unit-tests` job | `cd apps/server && bun test:unit` | S |
| A.1.2 | Add `build` job | `bun build` at repo root (turbo) | S |
| A.1.3 | Add `package-tests` matrix | `packages/types`, `services`, `api`, `db` — each `bun test` if script exists; else add minimal script | S |
| A.1.4 | Pin Bun `1.2.22` | Match root `packageManager` | S |
| A.1.5 | Add Bun cache | `~/.bun/install/cache` keyed on `bun.lock` | S |
| A.1.6 | Add concurrency | `cancel-in-progress: true` per PR | S |
| A.1.7 | Fix job label | "Biome lint" → "Oxlint" | S |
| A.1.8 | Extend drift-check to `dev` | `drift-check.yml` branches: `[main, dev]` | S |

### A.2 — Documentation P0

| ID | File | Fix | Effort |
|----|------|-----|--------|
| A.2.1 | `README.md` | Biome = format only; `bun check` = oxlint; password `password1234`; OpenAPI `avantej.localhost:3020`; list all 5 packages | S |
| A.2.2 | `docs/testing/_setup.md` | Ports 3021/3020; hosts `avantej.localhost` | S |
| A.2.3 | `CONTRIBUTING.md` | Replace root `bun test` with explicit server/web paths | S |
| A.2.4 | `README.md` top | "Start here" → CONTRIBUTING → zhub → CLAUDE | S |
| A.2.5 | `e2e/README.md` (new) | Auth setup, credentials, smoke vs journey, single-spec command | S |
| A.2.6 | RHF status | Grep remaining RHF imports; document count + sunset in CONTRIBUTING or complete removal list | S |

### A.3 — Critical router tests

| ID | File | Scenarios | Effort |
|----|------|-----------|--------|
| A.3.1 | `packages/api/src/routers/pos.router.test.ts` | Member sale; walk-in package rejection; non-client rejection; RBAC denial | M |
| A.3.2 | `packages/api/src/routers/appointments.router.test.ts` | Overlap/buffer rejection; cancel; trainer conflict → user-facing error | M |
| A.3.3 | `apps/server/src/routers/payments.test.ts` | Refund idempotency; Connect error mapping; status query | M |

Use existing patterns from `packages/api/src/routers/services.router.test.ts` and `apps/server/src/tests/helpers/context.factory.ts`.

### A.4 — Branch protection

| ID | Task | Effort |
|----|------|--------|
| A.4.1 | Enable required checks on `main` and `dev` | S |
| A.4.2 | Document required checks in `CONTRIBUTING.md` §CI | S |

---

## 5. Verification

```bash
# Local pre-merge
bun check-types
bun check
cd apps/server && bun test:unit
cd apps/web && bun test --run
bun build
bun verify:migrations   # if touching db
```

---

## 6. Risks

| Risk | Mitigation |
|------|------------|
| Server unit tests flaky | Fix or quarantine in PR; do not skip in CI |
| Build job slow | Turbo cache in Plan B; acceptable for Plan A |
| Package missing test script | Add `"test": "bun test"` to package.json where tests exist |

---

## 7. Not in Plan A

- E2E smoke CI (Plan B)
- api-overview regeneration (Plan D)
- `tenantProcedure` (Plan C — gated on Plan B)
