# Plan D — Structure & Code Organization

**Session:** `05-23_20-00_quality-9-roadmap`  
**Depends on:** Plan A (CI); may overlap Plan C after batch 2  
**Dimensions lifted:** Code org (8→9), Documentation (sustain), Maintainability (7→8.5)

---

## 1. Problem

Three parallel frontend patterns (fat routes, `components/pages/`, partial `features/`). `packages/api/src/routers/index.ts` is 2,838 lines of type stubs. Top routes exceed 1,000 LOC. Legacy duplicate routes under `/_authenticated/*` coexist with dashboard versions. No lint-enforced import boundaries. The API overview and page inventory (previously in zhub, now retired) drift from live routes.

---

## 2. Goals

1. **No route file >400 LOC** (excluding layout shells).
2. **`routers/index.ts` <150 LOC** — type stubs extracted.
3. **Legacy route consolidation** — single canonical dashboard path per feature.
4. **oxlint import boundaries** for web packages and feature isolation.
5. **Documentation automation** — api-overview generator + route coverage check.

---

## 3. Success criteria

- [ ] Max LOC script passes on `apps/web/src/routes/` (threshold 400)
- [ ] `packages/api/src/routers/index.ts` ≤150 lines
- [ ] Zero full implementations at `apps/web/src/routes/_authenticated/{appointment,service,service-category,user}/view.tsx` (redirect or deleted)
- [ ] oxlint `no-restricted-imports` rules active in CI
- [ ] `bun scripts/gen-api-overview.ts` (or equivalent) produces diff-free output vs the committed API overview
- [ ] `useApiMutation` on 100% of dashboard mutations (0 raw `useMutation`)
- [ ] react-doctor diff gate fails PR on score regression

---

## 4. Sprint map (one domain per sprint)

| Sprint | Source | Target | Route LOC target |
|--------|--------|--------|------------------|
| D-S1 | `operations/approvals.tsx` (1,624) | `features/approvals/` | ≤80 |
| D-S2 | `refunds/view.tsx` (1,310) | `features/refunds/` | ≤80 |
| D-S3 | `reports/view.tsx` (1,186) | `features/reports/` | ≤80 |
| D-S4 | `platform-admin/tenants.$id.tsx` (1,219) | `features/platform-admin-tenant/` | ≤80 |
| D-S5 | `class-slots/view.tsx` (1,395) | `features/class-slots/` | ≤80 |
| D-S6 | API type stubs | `packages/api/src/routers/_types/` | index ≤150 |
| D-S7 | Mega routers split | `members`, `package-instances`, `hierarchy` | ≤300 each file |
| D-S8 | Legacy cleanup | redirects + delete dupes | — |

Each sprint PR must include:
- Thin route shell
- Lazy import if page bundle heavy
- Vitest for primary page component
- knowledge-graph page create/update (previously zhub, now retired)

---

## 5. Tasks

### D.1 — Feature extraction (web)

Follow `apps/web/src/features/.README.md`:
- `components/`, `hooks/`, `api.ts`, `types.ts`
- No cross-feature imports

| ID | Deliverable | Effort |
|----|-------------|--------|
| D.1.1 | `features/approvals/` | L |
| D.1.2 | `features/refunds/` | L |
| D.1.3 | `features/reports/` | L |
| D.1.4 | `features/platform-admin-tenant/` | L |
| D.1.5 | `features/class-slots/` | L |
| D.1.6 | Migrate remaining `components/pages/*` (37 files) | L |

### D.2 — API organization

| ID | Task | Effort |
|----|------|--------|
| D.2.1 | Create `packages/api/src/routers/_types/` — move `*RouterType` stubs | L |
| D.2.2 | Split `package-instances.ts` (1,923 LOC) — delegate to services | L |
| D.2.3 | Split `hierarchy.ts` (1,524 LOC) | L |
| D.2.4 | Split `members.ts` (1,707 LOC) | L |
| D.2.5 | Group `apps/server/src/routers/platform-admin/*.ts` | M |

### D.3 — Duplicates & legacy

| ID | Task | Effort |
|----|------|--------|
| D.3.1 | Unify `service-form.tsx` / `service-form-a.tsx` | M |
| D.3.2 | Unify dual `confirm-payment-dialog` | M |
| D.3.3 | Redirect or delete 4 pre-dashboard routes | M |
| D.3.4 | Sunset 14 `makeTabRedirect` — log hits 30d then delete | M + wait |
| D.3.5 | Fix `components/forms/README.md` (TanStack Form) | S |
| D.3.6 | Rename or fold `merge-tables/` → inventory naming | S |

### D.4 — Lint boundaries

| ID | Rule | Effort |
|----|------|--------|
| D.4.1 | Web cannot import `@avantej-core/services` | S |
| D.4.2 | `features/*` cannot import other `features/*` | S |
| D.4.3 | Document in `CLAUDE.md` | S |

### D.5 — Mutation standardization

| ID | Task | Effort |
|----|------|--------|
| D.5.1 | Migrate 43 raw `useMutation` files to `useApiMutation` | M |
| D.5.2 | Grep gate in CI script (optional) | S |

### D.6 — Documentation tooling

| ID | Task | Effort |
|----|------|--------|
| D.6.1 | `scripts/gen-api-overview.ts` — read merged `appRouter` keys | L |
| D.6.2 | CI: fail if the API overview (enumerate from `packages/api/src/routers/`) is stale when `packages/api/**` changes | M |
| D.6.3 | `/graphify . --update` command OR `scripts/check-routes.ts` | M |
| D.6.4 | Update the page inventory (`graphify-out/GRAPH_REPORT.md`): customers v2, packages/view, reports, platform-admin section | M |
| D.6.5 | Deprecate `docs/api-reference.md` → pointer to live OpenAPI | S |
| D.6.6 | `docs/adr/README.md` index | S |

### D.7 — Lazy loading

| ID | Routes | Effort |
|----|--------|--------|
| D.7.1 | Add `*.lazy.tsx` for expenses, branch, announcements, settings pages >500 LOC | M |

### D.8 — react-doctor gate

| ID | Task | Effort |
|----|------|--------|
| D.8.1 | `doctor:diff` in CI or react-doctor `fail-on: error` with score threshold | S |

---

## 6. Verification

```bash
# Max route LOC (add script)
bun scripts/check-route-loc.ts --max 400

bun check
bun check-types
cd apps/web && bun test --run
bun scripts/gen-api-overview.ts && git diff --exit-code graphify-out/
```

---

## 7. Parallelization with Plan C

| Safe parallel | Avoid parallel |
|---------------|----------------|
| D-S1 approvals UI split | Same router as C.5 batch 3 in one PR |
| D.2 API type stub extract | C.5 members migration same week |
| D.6 doc scripts | — |

---

## 8. Not in Plan D

- Business logic wiring (Plan E)
- Walk-in removal (Plan E)
- Native `features/` parity (stretch — separate session)
