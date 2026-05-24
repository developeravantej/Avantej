# Before Execute — Readiness Checklist

**Session:** `05-23_20-00_quality-9-roadmap`  
**Rule:** Do not start a plan's `/execute` until its pre-execute items for that plan are satisfied.

---

## Global (once per program)

| # | Item | Owner | Done when |
|---|------|-------|-----------|
| G1 | Locked decisions recorded in `overview.md` (D1–D3) | — | ✅ |
| G2 | GitHub repo secrets for dev Neon documented (Plan B): `CI_DATABASE_URL`, `CI_TENANT_DATABASE_URL`, `ENCRYPTION_KEY` | DevOps | Secrets exist in repo settings |
| G3 | Branch protection targets known (list in Plan A exit gate) | DevOps | Checklist in CONTRIBUTING |

---

## Plan A — execute now (no prior audit required)

Plan A is **self-contained**. Pre-execute:

| # | Check | Notes |
|---|-------|-------|
| A0.1 | Confirm `apps/server` `bun test:unit` passes locally | Fix red tests before enabling CI job |
| A0.2 | Confirm `bun build` passes locally (or document known blocker) | Build job added in A.1.2 |
| A0.3 | Add `"test"` scripts to packages with `*.test.ts` files | Required for A.1.3 — was missing before Plan A |

**Optional (not blocking Plan A):** doc-consistency pass on README vs CONTRIBUTING.

---

## Plan B — before execute (required audit)

**Hard gate for Plan C (D1).** Complete before opening Plan B work:

| # | Audit lens | Output | Blocking findings |
|---|------------|--------|-------------------|
| B0.1 | **doc-consistency** | `gaps/doc-consistency.md` | Wrong Playwright ports/paths; macOS-only config |
| B0.2 | **api-surface** | `gaps/api-surface.md` | Smoke spec list references missing files |
| B0.3 | **test-coverage** | `gaps/test-coverage.md` | Seed helper contract undefined |

**Plan doc updates before B execute:**

- [ ] Plan B says **extend** `e2e/smoke.spec.ts` (not create from scratch)
- [ ] Plan B adds task **B.0** — provision `ci-fixture` org + document in `e2e/README.md`
- [ ] Router test naming convention locked: `*.router.test.ts` in `packages/api`

**Plan B exit gate (unblocks Plan C):** sign-off block in `plan-b/plan.md` — 3 consecutive green smoke merges.

---

## Plan C — before execute

| # | Requirement |
|---|-------------|
| C0.1 | Plan B exit gate signed off |
| C0.2 | **api-surface** audit: exhaustive list of routers using `protectedProcedure` + `tenantDb` |
| C0.3 | **test-coverage** audit: integration tests for SaaS gate + branch guard drafted |
| C0.4 | Staging past-due test procedure written in plan-c |

---

## Plan D — before execute

| # | Requirement |
|---|-------------|
| D0.1 | Plan C batch 1 (read-only `tenantProcedure`) merged OR explicitly deferred with sign-off |
| D0.2 | Max-LOC script path decided (`scripts/check-route-loc.ts`) |
| D0.3 | Feature extraction order confirmed (approvals → refunds → reports) |

---

## Plan E — before execute

| # | Requirement |
|---|-------------|
| E0.1 | **E.0 audit refresh** — re-read commission/tax/notification code vs `FEATURE_WIRING_AUDIT.md` |
| E0.2 | **schema-drift** audit for E.3 (`class_slot_bookings`) before migration PR |
| E0.3 | **scalability** audit for waitlist auto-promote + class slot capacity (race conditions) |

---

## Audit-swarm usage

| When | Scope | Command |
|------|-------|---------|
| Not now | — | Plan A does not need swarm |
| Before Plan B | `plan-b/plan.md` + `overview.md` §Dev Neon | `/audit-swarm zplan/05-23_20-00_quality-9-roadmap/plan-b` (adapt paths — session uses `plan-b/` not `plan/plan.md`) |
| Before Plan E.3 | Plan E class slots section | schema-drift lens only |

Full 6-lens swarm on the entire program at once is **not recommended** — staged audits per gate above.

---

## Execute status

| Plan | Pre-execute | Execute |
|------|-------------|---------|
| A | ✅ Ready | ✅ **Done** (2026-05-23) — branch protection manual step remains |
| B | ☐ Audit B0.1–B0.3 | Blocked on A CI green in GitHub |
| C | ☐ Plan B gate | Blocked |
| D | ☐ C batch 1 | Blocked |
| E | ☐ E.0 refresh | Blocked |
