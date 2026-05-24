# Quality 9 Roadmap — Program Overview

**Session:** `05-23_20-00_quality-9-roadmap`  
**Drafted:** 2026-05-23  
**Baseline scores:** Architecture 9 · Code org 8 · Docs 9 · Tests 7.5 · CI 6 · Production 7.5 · Maintainability 7

---

## Goal

Raise every audited dimension to **≥ 9/10** with measurable exit gates. This is an engineering-quality program, not a feature roadmap — though Plan E ships partial product wiring the audit flagged.

---

## Locked decisions

| # | Decision | Implication |
|---|----------|-------------|
| **D1** | **No SaaS / `tenantProcedure` work until E2E smoke is green** | Plan C is **hard-blocked** on Plan B exit gate. Do not start architecture middleware migration in parallel with smoke stabilization. |
| **D2** | **FEATURE_WIRING: ship** | Partial and CRUD-only domains get real business logic + tests. Do not hide nav items or delete admin UI as the default. Walk-in customers: **remove** stub API (product decision: legacy removal, not hide). |
| **D3** | **CI uses the current Neon development database** | No new `ci-e2e` Neon project. GitHub secrets mirror local dev: control-panel `DATABASE_URL` + franchise tenant connection (from `organizations` or `TENANT_DATABASE_URL` in `.dev.vars`). Integration and smoke tests must use **idempotent fixtures** and a dedicated test org slug to avoid clobbering manual dev data. |

---

## Plan map

```
Plan A — Trust layer          (CI P0 + doc accuracy + critical router tests)
    ↓
Plan B — Smoke green          (E2E seed + smoke CI + dev Neon wiring)  ← GATE for Plan C
    ↓
Plan C — Perimeter            (tenantProcedure, SaaS gate, Resend, CF rate limits)
    ↓
Plan D — Structure            (god-file splits, features/, import boundaries)
    ↓
Plan E — FEATURE_WIRING ship  (trainer availability, waitlist, class slots, tax, notifications, commissions verify)
```

| Plan | Folder | Horizon | Calendar (est.) | Person-effort |
|------|--------|---------|-----------------|---------------|
| **A** | `plan-a/` | Trust | Weeks 1–2 | 8–10 dev-days |
| **B** | `plan-b/` | Smoke + CI | Weeks 2–4 | 10–12 dev-days |
| **C** | `plan-c/` | Perimeter | Weeks 5–8 | 20–25 dev-days |
| **D** | `plan-d/` | Structure | Weeks 7–12 | 25–30 dev-days |
| **E** | `plan-e/` | Wiring ship | Weeks 9–14 | 30–40 dev-days |

Plans D and E may overlap **after** Plan C batch 1 (read-only `tenantProcedure` migration) lands — but not before Plan B gate.

---

## Dimension → plan ownership

| Dimension | Primary plan(s) | Target 9 definition |
|-----------|-----------------|---------------------|
| **Architecture** | C | `tenantProcedure` on all tenant writes; branch scoped; no `honoContext.get` leaks |
| **Code organization** | D | No route >400 LOC; `routers/index.ts` <150 LOC; zero legacy duplicate routes |
| **Documentation** | A (P0), D/E (ongoing) | README/CONTRIBUTING accurate; api-overview synced; zhub ⊆ routes |
| **Test coverage** | A, B, E | Server unit in CI; smoke E2E green; router tests for POS/appt/payments |
| **CI / automation** | A, B | 6+ required checks; integration on `main`; pinned Bun; cache |
| **Production readiness** | C, E | SaaS write gate; Resend prod; CF rate limits; wiring honest |
| **Maintainability** | D, E | FEATURE_WIRING closed; `useApiMutation` 100%; legacy sunset |

---

## Global exit gates (program complete)

- [ ] All GitHub required checks green on a noop PR (type-check, lint, web tests, server unit, build, e2e-smoke)
- [ ] Staging past-due tenant cannot mutate data (SaaS middleware)
- [ ] `grep` shows no route file under `apps/web/src/routes/` above 400 LOC (excluding layouts)
- [ ] `docs/FEATURE_WIRING_AUDIT.md` updated — every former gap marked **shipped** or **removed**
- [ ] `zhub/shared/api-overview.md` matches live `appRouter` keys (generator or manual verify)
- [ ] Dimension scorecard re-audit ≥ 9 on all seven (repeat agent audit or checklist in `overview.md` §Scorecard)

---

## Dev Neon CI safety rules (D3)

Because CI shares the **development** Neon databases:

1. **Dedicated test org** — use org slug `ci-fixture` (create once in dev CP DB). All CI writes scoped to that org's tenant branch.
2. **Idempotent seeds** — `e2e/helpers/seed-data.ts` and integration fixtures upsert by stable external IDs; cleanup in `afterAll` where safe.
3. **No destructive fleet ops in CI** — never run `migrate-all-tenants` or bulk deletes in automated jobs.
4. **Read-only jobs** — drift-check and `verify:migrations` stay read-only (already true).
5. **Secrets** — GitHub repo secrets:
   - `CI_DATABASE_URL` = same value as local control-panel `DATABASE_URL`
   - `CI_TENANT_DATABASE_URL` = tenant branch for `ci-fixture` org (or derive in setup script from CP)
   - `ENCRYPTION_KEY` = same as dev (required for connection string decrypt)
   - Reuse existing `DRIFT_CHECK_DATABASE_URL` if identical to `CI_DATABASE_URL`

6. **Parallel PR safety** — smoke job uses transactional test data or namespaced IDs (`ci-${GITHUB_RUN_ID}`) to reduce cross-run collisions.

---

## Scorecard (re-audit checklist)

Use this when closing the program:

| Dimension | Verify with |
|-----------|-------------|
| Architecture | Integration tests for branch guard + `tenantProcedure` denial without member |
| Code org | Script: max LOC per route file; oxlint import boundaries pass |
| Documentation | No README/CLAUDE/CONTRIBUTING contradictions; api-overview diff empty vs generator |
| Tests | CI dashboard: server unit + e2e-smoke required; <5% Playwright skip rate |
| CI | Branch protection screenshot; 6+ required checks |
| Production | Manual: past-due write block; external email delivery; 429 on auth flood |
| Maintainability | FEATURE_WIRING audit all green; ≤5 legacy redirects |

---

## Out of scope

- New product features beyond wiring audit items
- Separate Neon ci-e2e project (explicitly rejected — D3)
- Native app parity refactor (tracked as Plan D stretch only)
- Full Playwright journey suite in PR CI (nightly only in Plan B)

---

## Before execute

See **`before-execute.md`** for per-plan readiness checks, staged audit requirements, and execute status. Plan A may start immediately; Plan B requires a targeted audit; Plan C is hard-blocked until Plan B smoke exit gate passes.

---

## References

- Prior audit synthesis: conversation 2026-05-23 (seven dimension agents)
- Runtime hardening already shipped: `zplan/05-23_12-31_phase-8-runtime-perimeter/plan.md`
- Wiring source of truth: `docs/FEATURE_WIRING_AUDIT.md` (refresh in Plan E)
