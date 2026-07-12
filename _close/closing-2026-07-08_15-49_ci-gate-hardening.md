# /closing — CI gate hardening (PRs #71–#79)   ·   Overall: 7/10

What was done: Took `main` from a broadly-red CI board to green on every code-fixable
gate across 9 merged PRs — installments 409-mapping bug fix, unused-import Type Check
unblock, per-file test isolation runner (mock.module pollution), server-unit + services
mock-drift fixes, an 843-LOC email-domains router split into a folder module, push-tokens
`protectedProcedure→tenantProcedure`, Biome formatting + `.gitattributes`, the
`baseRouter` TS7056 Build fix, and the root `turbo check-types: dependsOn ^build` fix that
made web check-types read a fresh dist. (Surface audited: merged commits `0ad931e0..HEAD`;
working tree has no tracked changes of this session — the 27 untracked files belong to a
concurrent billing/print session.)

A. Edge cases     9/10  ✅  BaseRouter cast verified 74/74 keys; email-domains byte-identical; installments await/mapping complete.
B. E2E + video    7/10  ⚠️  CI-green is the right proof for build/type/mock fixes (all confirmed green), but the installments CONFLICT→409 path is never positively asserted, and email-domains provisioning is only in the red integration gate. No video (none applicable).
C. Best approach  8.4/10 ✅  Idiomatic (mirrors appRouter cast, documented split pattern). Two flags: a now-dead DataImportPage band-aid and a missing perimeter guard.

Gate: NEEDS WORK  (overall 7 < 8; no ❌, weakest link is B's untested behavior change)

Arithmetic: overall = min(9, 7, 8.4) = 7; below-7 count = 0 → no −1.

---

## Fix plan (ordered: quick wins → harder gaps)

### 1. Revert the now-dead `DataImportPage` band-aid  ·  lifts A 9→10, C 8.4→~9  ·  quick
- **What's wrong:** PR #78 added a local `ImportHistoryRow` type + `as ImportHistoryRow[]` cast to work around `orpc.dataImport` typing as `any`. Since #77 (`BaseRouter` types `dataImport`) and #79 (`check-types ^build` → fresh dist) landed, the client now types `dataImport` correctly, so the band-aid is dead code. It also introduces a latent trap: `createdAt` is typed `string` but oRPC delivers a `Date` at runtime (only safe today because `formatDate` accepts both).
- **file:line:** `apps/web/src/components/pages/settings/import/DataImportPage.tsx:46-58` (the `ImportHistoryRow` type) and `:94` (`const history = (historyQuery.data ?? []) as ImportHistoryRow[];`).
- **Fix:** delete the `ImportHistoryRow` type block; change line 94 back to `const history = historyQuery.data ?? [];`. `job` will now infer from the real (fresh-dist) query type.
- **Verify:** `bun --cwd apps/web run check-types` → no `DataImportPage` error (only the concurrent session's untracked `payment/print/*` files, which aren't on CI). Confirm `dataImport` is non-`any`: it resolves through `BaseRouter` (`base-router.ts:168`).

### 2. Add `assertOrgContextMatch` to both push-tokens procedures  ·  lifts C  ·  quick
- **What's wrong:** `register`/`unregister` accept `organizationId` in input but never call `assertOrgContextMatch(context, input)`. `tenantProcedure`/`requireTenant` only assert `tenantDb` + membership exist — they do NOT compare `input.organizationId` to the context org. CLAUDE.md "Router Guards" lists `assertOrgContextMatch` as the anti-cross-tenant-spoofing guard, and nearly every other tenant router calls it. Severity low (write keys on the caller's own `session.user.id` against the already-resolved tenant DB), but it's a documented-perimeter inconsistency.
- **file:line:** `packages/api/src/routers/push-tokens.ts` — both handlers (register ~:25, unregister ~:44).
- **Fix:** `import { assertOrgContextMatch } from "../guards";` and call `assertOrgContextMatch(context, input);` as the first line of each handler.
- **Verify:** `bun run ci:check-tenant-perimeter` still passes; `bun --cwd packages/api test src/routers/push-tokens*.test.ts` (if present) / `bun check-types`.

### 3. Positively assert the installments CONFLICT→409 path  ·  lifts B 7→~8.5  ·  moderate
- **What's wrong:** The bug fixed (`mutate.procedures.ts:237,273`) is that rescheduling a **locked** installment now returns 409, not an opaque 500. But the touched spec deliberately *avoids* locked rows (`_e2e/web/installments/installments.deep.spec.ts:154-163`, `.filter({ hasNotText: "Locked" })`), so the fixed path is never asserted. `waive` has no e2e at all.
- **Fix (API-boundary, runnable without a browser):** add a deep/API test that calls `installments/reschedule` on a known-locked installment and asserts the response is `409` / `code: "CONFLICT"` (and a `waive`-on-paid case → `409`). Model it on the existing `/rpc/<router>/<proc>` API-boundary specs (see the `_e2e` deep suite pattern). This closes the gap without needing the browser.
- **Verify:** run the new spec against the dev tenant; assert status 409 + `CONFLICT` message. (Note: the Playwright *smoke* gate that would host a UI version is red — needs Neon creds — so an API-boundary assertion is the pragmatic proof.)

### 4. (Flag only) email-domains provisioning has no green run  ·  B  ·  hard, low priority
- **What's wrong:** The split's re-export is unit-verified (`email-domains.audit.test.ts`, green Server Unit gate), but the actual provisioning procedures are only exercised by `email-domains.integration.test.ts`, which auto-skips without `DATABASE_URL` (the red Server-integration gate). No green run proves the merged router still provisions.
- **Why low priority:** it's a behavior-preserving structural refactor — Agent A confirmed the extracted handlers are byte-identical to the original, and all 13 procedures are present. CI-green on Server Unit + the LOC gate is largely defensible.
- **Action:** leave as documented debt unless someone has Neon creds to run the integration gate.

---

## Verification (after applying 1–3)
- `bun --cwd apps/web run check-types` — DataImportPage clean (task 1).
- `bun run ci:check-tenant-perimeter` — green (task 2).
- `bun check-types` (cache-free: `bunx turbo check-types --force`) — 0 tracked errors.
- New installments API-boundary spec — asserts 409/CONFLICT on locked reschedule + paid waive (task 3).
- Re-run `/closing ci-gate-hardening` to re-rate (expect A→10, C→~9, B→~8.5, overall →~8.5, Gate PASS).

---

## Re-rate 2026-07-08_16-07 (after PR #80)

Applied all three plan tasks in PR #80 (merged to main):
1. ✅ Reverted the dead `ImportHistoryRow` band-aid in DataImportPage.tsx — verified apps/web check-types clean.
2. ✅ Added `assertOrgContextMatch(context, input)` to both push-tokens procedures — verified `ci:check-tenant-perimeter` + packages/api check-types pass.
3. ⚠️→✅ Added `_e2e/web/installments/installments-conflict.rule.spec.ts` asserting locked-reschedule → 409 CONFLICT. Well-formed (Playwright lists it; contract matches the service's real CONFLICT throw) and the e2e reconcile drift-guard passes — but **could not be executed** in this session (no `apps/server/.dev.vars`/API server; same Neon-creds gap that reds the Playwright + Server-integration gates).

| Check | Before | After | Δ |
|---|---|---|---|
| A. Edge cases    | 9/10  | **10/10** ✅ | createdAt string-vs-Date trap removed with the band-aid |
| B. E2E + video   | 7/10  | **8/10** ⚠️→✅ | CONFLICT→409 now asserted in code (was "never asserted anywhere"); still unrun locally (env) + waive/email-domains gaps remain |
| C. Best approach | 8.4/10| **9.5/10** ✅ | both flags resolved (dead band-aid gone; perimeter guard added) |

**Overall: 8/10** — min(10, 8, 9.5) = 8; zero checks below 7 → no penalty.
**Gate: PASS** (≥8, no ❌).

Residual (documented, not blocking): the new 409 spec and the email-domains provisioning flow both need a live server + Neon creds to run green — the same environment dependency that keeps the Playwright smoke + Server-integration CI gates red. Not fixable from a local session without those secrets.
