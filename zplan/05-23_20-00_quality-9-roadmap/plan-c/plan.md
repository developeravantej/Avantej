# Plan C — Perimeter & Production

**Session:** `05-23_20-00_quality-9-roadmap`  
**Depends on:** **Plan B exit gate** (decision D1 — E2E smoke green)  
**Blocks:** none (Plan D/E may start in parallel after C batch 2)  
**Dimensions lifted:** Architecture (9→9.5), Production (7.5→9), CI (8.5→9 partial)

---

## 1. Problem

ADRs specify SaaS subscription gates and tier features, but `requireActiveSaaSSub` is not composed on tenant mutations. RBAC hierarchy scope can be bypassed via explicit `branchId` in analytics/inventory. Resend still on sandbox sender. Auth rate limits use in-memory per-isolate Maps. Permission denials sometimes throw plain `Error`.

Phase 8 shipped health/ready, OAuth signing, audit log — this plan completes the **API enforcement** layer.

---

## 2. Goals

1. Framework-level **`tenantProcedure`** — tenant context required for all tenant-scoped APIs.
2. **Hierarchy branch guards** on every code path accepting `branchId`.
3. **`requireActiveSaaSSub`** on all tenant **mutations** (reads exempt unless ADR says otherwise).
4. Production email, rate limits, auth hardening.
5. Cross-package integration tests for perimeter (past-due write block, branch bypass fix).

---

## 3. Success criteria

- [ ] Past-due org (grace expired) receives `403` on tenant mutation oRPC calls in integration test
- [ ] Analytics with out-of-scope `branchId` returns `FORBIDDEN` or empty scoped result (document choice)
- [ ] `requirePermission` failures always map to `ORPCError("FORBIDDEN")`
- [ ] Resend sends to external inbox from production from-address
- [ ] Auth routes use Cloudflare rate-limit binding (not in-memory Map)
- [ ] `BETTER_AUTH_SECRET` has no dev fallback when `ENVIRONMENT=production`
- [ ] `auto-resume-holds` cron in `wrangler.jsonc`
- [ ] Migration deploy checklist in runbook

---

## 4. Execution order (strict)

Do **not** reorder — each step has regression tests.

```
C.1 assertBranchAccessible helper + analytics fix
C.2 organizationId mismatch guard
C.3 Permission → ORPCError
C.4 tenantProcedure definition
C.5 Router migration batches (4 batches)
C.6 requireActiveSaaSSub on mutations
C.7 requireTierFeature (ADR-0010) on gated routers
C.8 Production infra (Resend, CF rate limit, auth secret)
C.9 Integration tests + staging verification
```

---

## 5. Tasks

### C.1 — Hierarchy scope (P0)

| ID | File | Change | Effort |
|----|------|--------|--------|
| C.1.1 | New: `packages/services/src/hierarchy-scope.ts` | `assertBranchAccessible(branchId, accessibleNodeIds)` | S |
| C.1.2 | `packages/services/src/analytics.service.ts` | Validate `params.branchId` before filter | S |
| C.1.3 | `packages/api/src/routers/products.ts`, POS routers | Guard `branchId` inputs | M |
| C.1.4 | Unit tests | `hierarchy-scope.test.ts` | S |

### C.2 — Input / context alignment

| ID | File | Change | Effort |
|----|------|--------|--------|
| C.2.1 | `packages/api/src/index.ts` | Middleware: reject `input.organizationId !== context.organizationId` | S |

### C.3 — Permission errors

| ID | File | Change | Effort |
|----|------|--------|--------|
| C.3.1 | `packages/services/src/permission.service.ts` | `requirePermission` throws `ORPCError("FORBIDDEN")` or wrapper `requirePermissionOrpc` | S |

### C.4 — `tenantProcedure`

| ID | File | Change | Effort |
|----|------|--------|--------|
| C.4.1 | `packages/api/src/index.ts` | Chain: session → tenantDb + member + organizationId | M |
| C.4.2 | Document three tiers in `CLAUDE.md` (auth/RBAC/context flow) | public / protected / tenant | S |

### C.5 — Router migration (batched PRs)

| Batch | Routers (examples) | PR size cap | Effort |
|-------|-------------------|-------------|--------|
| **1** | analytics, notifications, audit, announcements (read-heavy) | 15 procedures | M |
| **2** | brands, categories, rooms, trainers, tax-rates | 15 procedures | M |
| **3** | sales, POS, installments, refunds, payouts, package-instances | 20 procedures | L |
| **4** | members, invitations, role-permissions, hierarchy, onboarding | 20 procedures | L |

Each batch:
- Replace `protectedProcedure` with `tenantProcedure` where tenant DB required
- Run `bun test:unit` + affected web tests + smoke (Plan B suite)

### C.6 — SaaS subscription gate

| ID | File | Change | Effort |
|----|------|--------|--------|
| C.6.1 | `require-active-saas-sub.middleware.ts` | Use request-scoped `controlPanelDb` from context | S |
| C.6.2 | Compose on mutation procedures | `.use(requireActiveSaaSSub)` or inline in `tenantProcedure` variant `tenantMutationProcedure` | M |
| C.6.3 | `apps/web` | Past-due banner + disable mutation buttons (if not exists) | M |
| C.6.4 | Integration test | `saas-gate.integration.test.ts` | M |

### C.7 — Tier features (ADR-0010)

| ID | Task | Effort |
|----|------|--------|
| C.7.1 | Implement `requireTierFeature(feature)` middleware | M |
| C.7.2 | Apply to GHL, memberships, and other gated routers per ADR | M |

### C.8 — Production infra

| ID | Task | Files | Effort |
|----|------|-------|--------|
| C.8.1 | Resend domain verification | `docs/resend-domain-verification.md`, Wrangler secrets | S + DNS |
| C.8.2 | CF rate-limit binding | `rate-limit.middleware.ts`, `wrangler.jsonc` | M |
| C.8.3 | Webhook rate limit | `/webhooks/*` | S |
| C.8.4 | Remove `BETTER_AUTH_SECRET` fallback | `better-auth.ts` | S |
| C.8.5 | Wire `auto-resume-holds` cron | `wrangler.jsonc`, `index.ts` scheduled | S |
| C.8.6 | Failed-login audit (FR-072) | auth hook + table or log | S |
| C.8.7 | Migration deploy checklist | `docs/TENANT_MIGRATION_WORKFLOW.md` | S |

### C.9 — Structured logging (Phase 8.3 remainder)

| ID | Task | Effort |
|----|------|--------|
| C.9.1 | `apps/server/src/lib/logger.ts` | M |
| C.9.2 | Replace high-traffic `console.*` in webhooks, stripe, auth | M |

Defer Logpush/Sentry wiring to post-9 polish.

### C.10 — Dead code cleanup (quick wins)

| ID | Task | Effort |
|----|------|--------|
| C.10.1 | Delete unused `apps/server/src/services/hierarchy*.ts` | S |
| C.10.2 | Move `process.env` in shared routers to context injection | M |

---

## 6. Integration tests (dev Neon)

| File | Scenario |
|------|----------|
| `saas-gate.integration.test.ts` | Webhook past-due → mutation 403 |
| `hierarchy-scope.integration.test.ts` | Out-of-scope branchId denied |
| `tenant-migrate-procedure.integration.test.ts` | Fresh schema → procedure works |

Run in Plan B integration job; must pass before Plan C close.

---

## 7. Verification

```bash
cd apps/server && bun test:unit && bun test:integration
# Staging manual: mark org past-due, attempt create appointment → 403
# Rate limit: 11th login/min → 429
```

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| `tenantProcedure` breaks edge procedures | Batch migration; grep all `protectedProcedure` + tenantDb usage first |
| SaaS gate blocks legitimate ops | Exempt platform-admin cross-tenant reads per ADR-0036 |
| CF rate limit misconfig | Staging load test before prod |

---

## 9. Not in Plan C

- God-file splits (Plan D)
- FEATURE_WIRING product logic (Plan E) — except tier gate wiring
- api-overview generator (Plan D)
