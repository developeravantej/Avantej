# Scalability Audit
**Session:** 04-19_19-30_tier3-quality-bets
**Lens:** scalability
**Findings:** 5 (0 critical · 2 high · 2 medium · 1 low)

## Findings

### [HIGH] `invalidateQueries` with bare `.key()` will miss parameterized queries — mutations won't refresh UI
**Plan claims:** "All invalidations use `orpc.X.Y.key()` — keys always stay in sync with the query definition." §6 also notes: "If the query passes input parameters, a bare `.key()` (no args) may not match. Check each site."
**Actual:** Multiple affected files pass `organizationId` and other parameters to their queries, making the bare `.key()` call a key mismatch:
- `invitations-page.tsx:32` uses query with `organizationId` + `statusFilter` params; invalidation calls at lines 79/113/232 with bare `.key()` will NOT match.
- `customer-detail-sheet.tsx:204–215` queries with `organizationId` + `memberId`; invalidations at lines 264/267 with bare key will miss the parameterized cache entry.
- `commissions/bulk-action-bar.tsx`: commission query likely passes `organizationId`.
After the fix, mutations will succeed (green toast) but the data grid will NOT refresh — the old stale data stays visible until the user navigates away. This is a silent functional regression.
**File:** `apps/web/src/components/invitations/invitations-page.tsx:79,113,232`, `apps/web/src/components/customers/customer-detail-sheet.tsx:264,267`, `apps/web/src/components/commissions/bulk-action-bar.tsx`
**Fix:** For each mutation site, use `queryClient.invalidateQueries({ queryKey: orpc.X.Y.key(), exact: false })` to match all param variants. Alternatively, pass the same params used in the query to `.key(params)`. The `exact: false` approach is safer when the exact param shape is unclear.

---

### [HIGH] Bulk lazy-route migration risks `routeTree.gen.ts` corruption during simultaneous file renames
**Plan claims:** "Scripted approach: for each `view.tsx` in `_layout/`, create a `view.lazy.tsx` with the component code." Mitigation: "run `bun dev` once after bulk rename to let the plugin regenerate."
**Actual:** The TanStack Router Vite plugin watches for file-system changes and regenerates `routeTree.gen.ts` (1772 lines) in response. Renaming 46 files simultaneously in the file system while the watcher is active creates a race where:
1. Plugin starts regenerating after the first file change
2. 45 more files change during regeneration
3. Plugin completes regeneration with incomplete route list
4. Resulting `routeTree.gen.ts` has only partial routes — the remaining 45 changes trigger another regeneration cycle
This creates transient corruption that may persist until a clean rebuild. The plan's mitigation ("run `bun dev` once after") is correct but incomplete — it doesn't say to kill the file watcher BEFORE bulk rename.
**File:** `apps/web/vite.config.ts:9` (tanstackRouter plugin), `apps/web/src/routeTree.gen.ts` (1772 lines)
**Fix:** Add to Phase 3.5.3: stop `bun dev` before bulk rename, perform all renames (scripted), then start `bun dev` fresh. Alternatively, run the rename via a Node script that also manually triggers one plugin run at the end rather than relying on incremental watch events.

---

### [MEDIUM] Bundle size gate threshold (250 kB) is set without a baseline measurement
**Plan claims:** `size-limit` config: `"limit": "250 kB", "gzip": true` on `dist/assets/index-*.js`. Phase 3.5.2 says "Measure: run `bun build` on both before and after. Document in `bundle-baseline.md`."
**Actual:** `bundle-baseline.md` does not exist — Phase 3.5.2 has not been executed. The current app has 41 route files in `_layout/` (all in one chunk). Without a baseline, 250 kB may be too tight (causing immediate CI failures on merge) or too loose (missing real regressions). The `~N kB` placeholders in §2 (Performance) are unfilled.
**File:** `apps/web/package.json` (size-limit config not yet added), `zplan/04-19_19-30_tier3-quality-bets/plan/bundle-baseline.md` (missing)
**Fix:** Before setting the 250 kB gate, run `bun build` on the current unmodified branch and record the main chunk size. Update §2 with the actual before value. Set the gate to `(before_gzip * 0.4)` as a reasonable post-split target, or adjust based on the pilot migration measurement from Phase 3.5.2.

---

### [MEDIUM] Sentry `tracesSampleRate: 0.1` may exceed Sentry transaction quota on Cloudflare Pages
**Plan claims:** `tracesSampleRate: 0.1` (10% of sessions traced).
**Actual:** Cloudflare Pages apps typically see high request volumes. At 10% sampling with 10k DAU × 5 page views = 50k transactions/day → ~1.5M transactions/month. Most Sentry paid plans have transaction limits (e.g. 100k/month on Team plan). Overages can incur unexpected costs or cause Sentry to drop all transactions for the rest of the billing period (data loss).
**File:** `apps/web/src/lib/sentry.ts` (planned new file, §3.2)
**Fix:** Start with `tracesSampleRate: 0.01` (1%) for the first month. Document in `sentry.ts` that this value should be adjusted based on Sentry quota review. Add a comment: `// Adjust based on Sentry plan quota. See: CF Pages analytics for DAU estimate.`

---

### [LOW] DataTable `onKeyDown` keyboard navigation risk on tables without pagination
**Plan claims:** Phase 3.7.3 adds keyboard arrow-key navigation via `onKeyDown` to all DataTable instances.
**Actual:** Current DataTable implementations use `getPaginationRowModel()` with default page size 10 — keyboard handlers on 10 rows are negligible. However, if any DataTable is ever used without pagination (e.g. an export list or a small static table with 1000 rows), the `onKeyDown` handler will be called on every keypress for the entire list. With 1000 rows, `aria-rowcount={1000}` is fine (just a number), but scanning for the focused row on keydown in JS over 1000 DOM nodes has O(n) cost.
**File:** `apps/web/src/components/tables/*/view/data-table.tsx` (all ~20 variants)
**Fix:** Document in the keyboard navigation implementation: "Gate `onKeyDown` behind a check that pagination is active (`table.getCanPreviousPage() || table.getCanNextPage()`). For non-paginated tables, skip keyboard navigation or implement virtual-scroll-aware navigation."

---

## Summary
Two HIGH scalability hazards must be fixed before Phase 3.3 and Phase 3.5 execute: (1) the `invalidateQueries` key mismatch will silently fail to refresh parameterized query caches — a functional regression that passes visual testing but leaves stale data in the UI; (2) the bulk lazy-route migration must stop the file watcher before renaming 46 files simultaneously or risk corrupted route-tree generation. The bundle size gate needs a real baseline before the threshold is committed to CI. Sentry sampling should start conservatively. No DB queries, backend loops, or race conditions are introduced by this plan — the scalability concerns are entirely in the client-side query invalidation and build tooling.
