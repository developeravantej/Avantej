# Swarm Audit — GAPS (web-holding-it-back-plan.md)

**Session:** 06-05_18-18_next-steps-cleanup-commit-suite-ci
**Plan audited:** `plan/web-holding-it-back-plan.md` (frontend refactor)
**Run at:** 2026-06-06
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 14 (1 critical · 1 high · 4 medium · 2 low · 6 info)

> ⚠️ **gaps/ folder is shared.** The canonical filenames (`schema-drift.md`, `test-coverage.md`, `doc-consistency.md`, `type-safety.md`, `scalability.md`, and the older `GAPS.md`) belong to a **prior swarm of the `server-holding-it-back` plan**. THIS web audit lives in the `-web*` suffixed files and this `GAPS-web-holding-it-back.md`. Do not conflate the two.
> Web reports: `schema-drift-web.md` · `api-surface.md` · `test-coverage-web.md` · `doc-consistency-web.md` · `type-safety-web-holding-it-back.md` · `scalability-web-holding-it-back.md`

---

## Headline: one cross-lens contradiction, resolved

**api-surface** said Phase 1 is fully safe — "keep the `?? fallback` chains." **type-safety** said `review-tab.tsx:425` is CRITICAL — keeping the fallbacks fails `bun check-types`. I verified the source directly:

`PendingReviewRow` from the **service** (`packages/services/src/commission-splits.service.ts:2839`) has `amountCents` / `note` / `createdByName`. The component's mapping reads the SECOND operand of each `??` as `r.calculatedAmount` / `r.notes` / `r.createdBy` — **none of which exist on the service row.** With `r: any` they compile; once `r` is typed they become "property does not exist" errors.

→ **type-safety wins. The plan's T1.2 instruction "keep the field-remap fallbacks" is wrong for review-tab and must be corrected** (see P1-1).

---

## Priority Fix Order

### P1 — Critical (correct the plan before executing Phase 1)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| P1-1 | type-safety | Plan T1.2 says keep the `?? r.calculatedAmount / r.notes / r.createdBy` fallbacks. Those properties don't exist on the typed service row → `bun check-types` fails. Also the RM 0.00 trap: map the WRONG field and the commission amount silently renders 0. | `components/pages/commissions/review-tab.tsx:425-435` | Type `r` as the service row (`Awaited<ReturnType<typeof client.commissionSplits.listPendingReview>>["rows"][number]`), then map DIRECT to real fields: `calculatedAmount: r.amountCents`, `notes: r.note`, `createdBy: r.createdByName`. Keep `?? null` only where the component's local type is nullable. Delete the dead dual-fallbacks. |

### P2 — High (do alongside the P1 fix)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| P2-1 | test-coverage | Zero automated test asserts the review-tab amount remap (`amountCents → RM`). Combined with P1-1's RM 0.00 trap, a wrong rename passes type-check AND all e2e (the role-grouping spec never checks a monetary value). | `apps/web/src/__tests__/` (new) | Add a ~20-line RTL test: row with `amountCents: 12345` renders `RM 123.45`. Write it BEFORE editing line 425 so the trap is caught. |

### P3 — Medium (fold into the relevant phase)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| P3-1 | type-safety | Plan's Phase 3 "identical props in/out" rule is wrong for `installment-plans.tsx`: the create/edit + deactivate dialogs are inline closures with **zero props today** — they read ~6–7 parent `useState` setters directly. Extraction needs brand-new `*Props` interfaces + prop threading, not a straight cut/paste. | `settings/installment-plans.tsx` | When extracting, define explicit `PlanFormDialogProps` / `DeactivatePlanDialogProps` and thread state down. `PlanCard` is props-clean but needs `InstallmentPlanRow` + `samplePerInstallment`/`fmtPremium` lifted/exported. |
| P3-2 | type-safety | Plan misses a 3rd google-calendar `any`: `calendars: any[]` at line **405** (separate from the `as any` at 404). | `settings/google-calendar.tsx:405` | Drop the `any[]` annotation; the typed return from `listConnectedCalendars` already provides `calendars`. |
| P3-3 | doc-consistency | Plan line 18 claims "the other 16 `use client` are shadcn/ui primitives — leave them." Actually only **6** are in `/ui/`; **11** are app-authored (app-sidebar, email-verify-banner, trainers/\*, customers/v2/\*, bones/registry, commissions/view). Doesn't break execution (Phase 0 only removes view.tsx) but understates removable cruft and the rationale is false. | `plan/web-holding-it-back-plan.md:18` | Reword to "only `commissions/view.tsx` in scope; 10 other app-authored `use client` directives exist but are out of scope this pass." Optionally widen Phase 0 to strip the 10 app-authored ones (all harmless no-ops). |
| P3-4 | scalability | `sales/$id.tsx` cancel mutation invalidates literal keys `["salesOrders"]` / `["cancelledSales"]`, which don't match oRPC's nested key shape — so the refetch likely **does nothing today**. Plan says "preserve exactly," so no regression, but Phase 2's useApiMutation conversion is the moment to fix it. | `sales/$id.tsx:193-194` | During Phase 2, replace the string keys with real `orpc.salesOrders.*.queryOptions({…}).queryKey`. Pre-existing latent bug, not introduced by the plan. |

### P4 — Low / Info (no action or minor)

- **LOW (scalability):** Phase 1 retype must preserve `roleType: r.roleType ?? null` (line 433) or the client-side `legacy` filter silently breaks. Just don't drop it.
- **LOW (type-safety):** `sales/$id.tsx:476` (`createdByName`) and `:621` (`branchId`) casts are SAFE to remove — both fields are on the built `salesOrders.getById` type (`dist` confirmed). No stub edit / rebuild needed.
- **INFO (schema-drift):** No schema/migration/enum/FK impact. `createdByName`/`connectedCount`/`totalTrainerCount` are server-computed (not columns); `branchId` is a real column. Confirmed clean.
- **INFO (api-surface):** Every procedure cited exists and is registered: `commissionSplits.{listPendingReview,resolveReview,listLedger}`, `googleCalendar.{orgStatus,listConnectedCalendars}`, `salesOrders.getById`, `auth.setPassword`.
- **INFO (doc-consistency):** All 8 file paths exist; LOC exact (966 / 765 / 660); every cited line number exact; the load-bearing claim that `check-router-file-loc.mjs` scans only `packages/api/src/routers` (god-components NOT CI-blocking) is CONFIRMED; set-password.tsx confirmed already-compliant; phase ordering sound (typing precedes extraction).
- **INFO (scalability):** No new queries/endpoints/loops/transactions; `useInfiniteQuery` pagination untouched by the retype; `useApiMutation` invalidation semantics identical to current hand-rolled `onSuccess`.
- **INFO (test-coverage):** Two existing tests are TRAPS — `installments-page.test.tsx` targets the package-instances view (not settings/installment-plans), `sales-view.test.tsx` targets the list (not the $id detail). e2e batch3/batch5 give white-screen smoke cover but not silent-display cover.

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift | 0 | 0 | 0 | 0 | 1 | clean — frontend-only, as expected |
| api-surface | 0 | 0 | 0 | 1 | 1 | sound, but over-optimistic on review-tab (see P1-1) |
| test-coverage | 0 | 1 | 0 | 0 | 1 | one real gap (amount remap) |
| doc-consistency | 0 | 0 | 1 | 0 | 1 | plan accurate; one false rationale |
| type-safety | 1 | 0 | 2 | 1 | 0 | the decisive lens this run |
| scalability | 0 | 0 | 1 | 1 | 1 | no regressions; surfaced a latent bug |

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| P1-1 retype review-tab map | 1 edit | 300–500 | small, but must be exact |
| P2-1 RTL test | 1 new | 800–1200 | new test file |
| P3-1 installment-plans extraction w/ props | 1 route + 3 new | 3000–5000 | the heavy lift; props threading |
| P3-2 google-calendar:405 | 1 edit | 150 | trivial |
| P3-3 plan text fix | 1 edit | 150 | doc only |
| P3-4 sales invalidation keys | 1 edit | 300 | fold into Phase 2 |
| sales/$id extraction | 1 route + 4 new | 2500–4000 | low-risk, mechanical |
| google-calendar + sales cast removal | 2 edits | 400 | trivial once typed |

---

## Auto-fixable findings (safe for `--apply` to the PLAN doc)

| # | Lens | Finding | Location | Mechanical fix |
|---|------|---------|----------|----------------|
| A1 | type-safety | Correct T1.2 wording for review-tab: map direct to `amountCents`/`note`/`createdByName`, drop dead fallbacks | plan §Phase 1 / T1.2 | Replace the "keep the field-remap fallbacks" sentence with the direct-map instruction |
| A2 | type-safety | Add google-calendar:405 `calendars: any[]` to the Phase 1 cast list | plan §Phase 1 / T1.2 | Append a bullet |
| A3 | doc-consistency | Fix the false "16 are shadcn primitives" claim | plan:18 | Reword to "6 in /ui/, 11 app-authored; only view.tsx in scope" |
| A4 | type-safety | Add the props-threading caveat to Phase 3 T3.1 | plan §Phase 3 / T3.1 | Note the dialogs are zero-prop closures needing new Props interfaces |
| A5 | test-coverage | Add P2-1 RTL test as a Phase 1 sub-task | plan §Phase 1 | Insert "T1.0 write amount-remap RTL test first" |
| A6 | scalability | Add P3-4 invalidation-key fix to Phase 2 | plan §Phase 2 | Note the literal keys don't match oRPC shape |

---

## Bottom line

The plan is **executable and ~90% accurate** — every file, LOC, and line number checks out, and the load-bearing "not CI-blocking" claim is confirmed. **One instruction is actively wrong** (P1-1: the review-tab fallback chain won't compile once typed) and would cost a confusing `bun check-types` failure mid-Phase-1, with a silent-RM-0.00 trap if fixed carelessly. Apply A1–A6 to the plan, then it's safe to execute. The set-password finding is correctly dropped.
