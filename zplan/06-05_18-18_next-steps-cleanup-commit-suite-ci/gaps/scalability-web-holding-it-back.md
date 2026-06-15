# Scalability Audit — `web-holding-it-back-plan.md`

**Auditor:** scalability
**Target:** `zplan/06-05_18-18_next-steps-cleanup-commit-suite-ci/plan/web-holding-it-back-plan.md`
**Date:** 2026-06-06
**Verdict:** No scalability regressions introduced. Plan is a frontend, behavior-preserving refactor (no new DB queries, endpoints, loops, or transactions).

> Note: `scalability.md` in this folder is a different audit (server `orpc-tenant.middleware` Task C). This report is written to a distinct filename to avoid clobbering it.

**Counts:** CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 1 · INFO 4

---

## Findings

### INFO-1 — Phase 1 `r: any` removal is type-only; infinite-query fetch behavior untouched
**File:** `apps/web/src/components/pages/commissions/review-tab.tsx:399-435`
**Rating:** INFO

The commissions review tab uses `useInfiniteQuery` with cursor pagination. Verified the structure:
- `queryKey` is derived from `orpc.commissionSplits.listPendingReview.queryOptions({ input: apiInput }).queryKey` (lines 402-404). This is input-derived and stable; Phase 1 does not touch `apiInput`, `queryFn`, `getNextPageParam`, or `initialPageParam`.
- The cast targeted by Phase 1 is at line 425: `rawRows.map((r: any) => ({...}))`. This is a pure **post-fetch projection** of already-fetched page rows. Retyping `r` from `any` to the inferred service row element changes zero runtime behavior — no fetch, no key, no pagination math is affected.
- `getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined` (line 417) is unrelated to the remap and is not in scope.

The plan explicitly scopes T1.2 to "type `r`… Keep the field-remap fallbacks" — correct. Confirmed the `?? fallback` chains (lines 428-434) must be preserved to avoid output changes; the plan calls this out in its Risk note. No extra fetches possible.

### INFO-2 — Phase 2 (`useMutation`→`useApiMutation`) does NOT widen invalidation scope
**Files:** `apps/web/src/components/pages/commissions/review-tab.tsx:452-493`, `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx:180-204`, `apps/web/src/hooks/useApiMutation.ts:58-66`
**Rating:** INFO

Verified `useApiMutation` invalidation internals: it iterates the provided `invalidate` keys and calls `queryClient.invalidateQueries({ queryKey })` once per key (lines 63-65) — **identical** to a hand-written `onSuccess`. The wrapper adds no broadening; refetch fan-out is determined entirely by the keys passed in.

Current vs planned keys:
- **review-tab.tsx**: current `onSuccess` invalidates `orpc.commissionSplits.listLedger.key()` and `orpc.commissionSplits.listPendingReview.key()` (lines 481, 484). Plan's T2.1 specifies `invalidate: [listLedger.key(), listPendingReview.key()]` — **exact match**. No change in number of invalidated queries.
- **sales/$id.tsx**: current `cancelSale.onSuccess` invalidates `["salesOrders"]` and `["cancelledSales"]` (lines 193-194). Plan's T2.2 says "preserve existing invalidate keys + side effects exactly." If followed literally, scope is unchanged.

Conclusion: no measurable increase in refetches. Both conversions are convention-only.

### INFO-3 — `.key()` prefix invalidation in review-tab is pre-existing and intentionally broad
**File:** `apps/web/src/components/pages/commissions/review-tab.tsx:481-484`
**Rating:** INFO

Note that the *query* uses an input-specific key (`.queryOptions({input}).queryKey`) while *invalidation* uses the procedure-level prefix `.key()`, which matches **all** inputs of `listPendingReview`/`listLedger` (every roleType filter variant). This is broader than strictly necessary but is the **current** behavior and is correct for a refresh-all-views-after-resolve UX. The plan preserves it verbatim, so it neither helps nor hurts scale. Flagging only so a future reviewer doesn't mistake the preserved breadth for a plan-introduced regression.

### INFO-4 — Phase 3 extractions: enforce "identical query keys" as a hard constraint (already stated)
**Files:** `sales/$id.tsx` (`useQuery` at lines 78, 319-320, 326, 333, 348), `settings/installment-plans.tsx`
**Rating:** INFO

The god-component extractions move existing `useQuery`/`useInfiniteQuery` calls into child components. The only scale risk in such a refactor is a query whose `queryOptions`/key changes when relocated (e.g. an inline-constructed input object that gets a different shape, producing a new cache key and an extra fetch). The plan's Phase 3 "Rules" already mandate "identical props in/out, identical query keys, no JSX output change." That constraint is the correct guard. **Recommendation:** keep it explicit in the execution brief — when a query moves into a child, pass the same input object (org id, ids) through props so the `queryKey` is byte-identical; do not reconstruct the input inside the child from scratch. As long as that holds, render/fetch behavior is preserved.

---

## Findings (LOW)

### LOW-1 — Pre-existing client-side `legacy` filter over the loaded page set; plan must not make it worse
**File:** `apps/web/src/components/pages/commissions/review-tab.tsx:439-443`
**Rating:** LOW

`filteredRows` applies a client-side `allRows.filter((r) => r.roleType == null)` when `roleFilter === "legacy"` (the API can't express `IS NULL`, per the comment at lines 385-391). This operates over `allRows`, the flattened set of **all fetched infinite-query pages** (limit 50/page) — it grows as the user clicks "load more". It is bounded by what's been paginated in, not the full table, so it is not unbounded-in-one-shot, but it does scan everything loaded so far on every render.

This is **pre-existing** and out of scope. The relevant audit point: Phase 1's retype of the `r: any` map (line 425) feeds `allRows`, which feeds this filter. Removing the cast must **not** change the projection (especially `roleType: r.roleType ?? null` at line 433) — if the `roleType` field were dropped or renamed during retyping, the `legacy` filter would silently break. **Constraint for execution:** preserve the `roleType` projection exactly. No new cost is introduced by the plan; this is a do-no-harm note.

---

## Summary

This is a frontend, behavior-preserving refactor with **zero backend scalability impact**. All four areas the brief flagged were verified against source:

1. **Query keys on extraction** — plan already mandates "identical query keys" (Phase 3 Rules). Confirmed this is the correct and sufficient guard; reinforced in INFO-4.
2. **Infinite query / pagination (review-tab ~399-435)** — Phase 1 only retypes the post-fetch `.map()` projection. `queryKey`, `queryFn`, `getNextPageParam`, and the cursor flatten logic are untouched. No fetch-behavior change. (INFO-1)
3. **`useMutation`→`useApiMutation` invalidation scope** — verified `useApiMutation` invalidates exactly the keys it's given, one call each (no broadening). Planned keys match current keys exactly for both review-tab (`listLedger.key()`, `listPendingReview.key()`) and sales/$id (`["salesOrders"]`, `["cancelledSales"]`). No extra refetches. (INFO-2, INFO-3)
4. **Client-side filtering over unbounded lists** — the `legacy` roleType filter (review-tab 439-443) is pre-existing, bounded by paginated pages, and out of scope. Only ask: don't break the `roleType` projection when removing the cast. (LOW-1)

**No HIGH/CRITICAL findings.** Executed as written (preserve query keys, preserve invalidate keys, preserve `?? fallback` projections), the plan introduces no measurable increase in fetches or renders. The single LOW is a do-no-harm constraint, not a regression.
