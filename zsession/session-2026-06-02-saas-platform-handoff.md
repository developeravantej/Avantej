# Session handoff — SaaS-platform simplification: remaining work (2026-06-02)

## Context (what just shipped — don't redo)

A SaaS-platform-layer simplification/hardening pass was reviewed and **merged to `main`** as PR #33 (`https://github.com/ZHIYUAN-TECHNOLOGY/avantej-core/pull/33`, merge commit `70aba506`).

- **Full candidate/bug catalogue + rationale:** `docs/SAAS_PLATFORM_DEEPENING_REVIEW.md` (19 candidates C1–C19, 9 bugs B1–B9, sequencing). **Read this first** — it's the source of truth for the remaining work; this handoff only points at what's left.
- **Done:** C1 (gate consolidation), C2 (audit helper), C3 (lifecycle state machine), C4 (effective-tier fee), C5 (dead-code delete), C8+C9 (webhook dedupe+projector), C18 (snapshot dedup), C19 (escapeHtml), B4 (read-only gate), sidebar + nav lean.
- **Bugs fixed:** B1, B2, B4, B5, B7, B8, B9 (+ 2 access-gate blockers caught in pre-merge review — commit `6b484914`).
- Local-run + platform-admin-login mechanics: memory `avantej-local-e2e-setup.md` (read before any local app/e2e work — `bun dev` crashes on native; use `bunx turbo dev --filter=web --filter=server`; dev admin `developer.avantej@gmail.com`/`password123`).

## Remaining TODO

### Open bugs
- **B6** → **C15** (comms send-cores): single vs bulk DM/announcement have drifted — different validation contracts + bulk swallows per-channel failures.
- **B3** → **C6** (tier-feature enforcement, ADR-0010): `requireTierFeature`/`assertWithinLimit` never coded → basic-tier tenants can call ghl/commissions/memberships. **Policy-gated** — enforcing *blocks basic tenants currently using those features*. Needs a product decision (enforce / grandfather / skip). Depends on C4's `resolveEffectiveTier` (done).

### Remaining candidates — safe (pure consolidation, no behavior change)
- **C7** — one org→subscription-state loader (dedup ~9 hand-rolled walks + 2× `resolveStripeCustomerId`).
- **C13** — MRR rollups + latest-snapshot-per-org window (dedup across 4 platform-admin aggregators).
- **C14** — extract shared impersonation cookie-swap + audit-rollback ceremony.
- **C12** — one supported-countries fact table (4 drifting copies → `packages/types`).
- **C16** — slim `orpcTenantMiddleware`: move public/admin/suspension policy onto procedure-layer bases (re-read that middleware — just edited for C3/B4).

### Remaining candidates — money/webhook (safe but review-careful)
- **C11** — branch-aware connect-account resolver (ADR-0017 seam; touches 5 charge sites in `payments.ts`).
- **C10** — decompose the ~450-line Connect webhook god-handler (scope to NOT share with backfill — ADR-0019 defers side-effect replay).

### Policy-gated
- **C17** — (a) delete dead `organization_analytics` (superseded by `tenant_usage_snapshots`, ADR-0023; needs a control-panel DROP migration). (b) ADR-0003 **full trial-expired lockout**: B4 ships *conservative* (read-only blocks writes, allows reads; `subscriptions`/`registration` exempt). Stricter "trial-expired = no reads" deferred until locked-out UX + a read-side exempt-list (auth/userContext) are defined.

## Known issues (pre-existing, NOT from the merged work)
- **CI has 2 pre-existing reds on `main`** (every PR inherits them): **Web Tests** (flaky tenant-page vitest — render page components directly; jsdom setup ~636s) and **drift-check** (live-DB-vs-schema drift: `commission_*`, `stock_movements`, `push_tokens`, `scheduled_reports`, Better-Auth `invitation`/`member`/`organization` orphan tables + 2 action-mismatches). A dedicated cleanup PR would unblock green CI. `verify:migrations` passes.
- **Server tests are NOT in `ci.yml`** (only type-check + web vitest + oxlint). Gate integration + lifecycle/effective-tier unit tests run **locally only** (`cd apps/server && bun test ...`). Run them by hand on server changes.
- **SaaS suspension/read-only gates are backend-only** (403 on `/rpc`); web UI has no blocked-tenant screen (ADR-0024 "future"). Verify gate changes via `apps/server/src/middleware/tenant-gates.integration.test.ts`, NOT a browser. Visible-UI smoke harness in `e2e-verify/`.

## Suggested skills
- **improve-codebase-architecture** — pick up more candidates with the same module/interface/depth framing.
- **brainstorming** — before C6/B3 and C17 (product/policy decisions, not mechanical).
- **superpowers:code-reviewer** — run on the diff BEFORE any merge. Caught 2 real blockers this round; access/billing paths are subtle.
- **verification-before-completion** — gates aren't web-visible, so unit/integration tests are the real evidence.
- **`/p`** (parallel DAG) — the safe consolidation candidates (C7, C12, C13, C14) are independent + file-partitionable.

## Watch-outs
- Each remaining candidate's exact files/problem/solution are in `docs/SAAS_PLATFORM_DEEPENING_REVIEW.md` — use it, don't re-derive.
- Money/access changes need product sign-off + a fresh-eyes review before merge. This round's blockers were both in the access gate, and a self-test passed *falsely* by hand-injecting the oRPC `method` — test against the real wire: procedure in the URL **path**, body `{ json: input }` (no `method`).
