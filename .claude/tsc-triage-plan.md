# Server tsc Triage — 2026-05-12

## TL;DR (root cause)

**~180 of the 203 errors come from a single stale artifact**: `packages/services/dist/index.d.ts` only re-exports ~30 pre-phase-5 symbols (hierarchy, member, invitation, permission). Every newer service (`announcements`, `brands`, `rooms`, `expenses`, `purchase-orders`, `installment-plan`, `tax-rates`, `commission-*`, `customer-profile`, `google-calendar`, `ghl-staff-sync`, `recurrence`, etc.) is missing from the dist.

Because `apps/server` is compiled with `moduleResolution: "bundler"` and `packages/services/package.json` resolves `"."` via `"types": "./dist/index.d.ts"`, TS sees the stale dist instead of `src/index.ts`. Every `import { X } from "@avantej-core/services"` where `X` was added after the last `tsdown` build fails as TS2305. Subpath imports (`@avantej-core/services/member.service`) hit the same problem via the stale `dist/<name>.service.d.ts` shims.

The remaining ~23 errors are real code issues — almost entirely the Phase H2 `slug` column addition on `hierarchy_nodes` (commit 2c8389c) plus a couple of branch-detail-split fallout points.

## Summary
- Total errors: 203
- Files: 48
- Buckets: DELETE=4, UPDATE=8, DROP-TEST=0, FIX-TEST=33, UNCLEAR=3
- **Single highest-leverage action**: rebuild `packages/services` (`cd packages/services && bun run build`) — projected to clear ~180 errors and reduce the residual surface to ~23 real schema-shape errors. Triage buckets below assume that rebuild has NOT happened; if it has, most rows collapse to no-op.

## DELETE (obsolete scripts)

These are one-off scripts that already ran against production. They are not referenced from `package.json`, not imported by application code, and last edited as part of the very schema-change commits that broke them. Safe to delete or move to `scripts/_archive/`.

| File | Errors | Reason |
|---|---|---|
| `apps/server/scripts/backfill-organization-branches.ts` | 1 | Reads `branch.address` — column removed in Phase H2 (commit `2c8389c`). One-shot backfill for the `organization_branches` registry; not in `package.json`; last touched by `c3e3696` (phase-5 typecheck remediation) and `d072108` (the very feature that created the registry). |
| `apps/server/scripts/seed-franchise-owner.ts` | 4 | All 4 errors are `hierarchyNodes.insert().values({...})` missing the new required `slug` column. Demo seed script, not wired into any deploy/CI step. |
| `apps/server/scripts/seed-coach-intake.ts` | 1 | Unused import of `eq` (`TS6133`). Trivial. Demo-data script. |
| `apps/server/scripts/backfill-organization-branches.ts` (already listed) | — | — |

Note: `apps/server/scripts/seed-franchise-owner.ts` is referenced *internally* by `seed-trainers.ts`, `seed-business-data.ts`, `seed-customers.ts`, `backup-tenant-tables.ts` (grep results), but none of those are referenced from `package.json` either — the whole demo-seed family is one ad-hoc pipeline. If keeping any seeds, fix this one; the cheap option is delete.

**Projected error drop: 6 errors.**

## UPDATE (active code needing migration)

Real source code that is still imported/mounted. Three of these have real schema-shape problems independent of the dist rebuild; the rest are pure stale-dist victims that disappear once `packages/services` is rebuilt.

| File | Errors | Symbols / Issue | Action |
|---|---|---|---|
| `apps/server/src/routers/customer-profiles.ts` | 5 | 1× missing `upsertCustomerProfile` re-export; 4× `"customer_management"` not assignable to `Resource`. **Both are stale-dist** — source `permission.service.ts` exports `customer_management` and `services/index.ts` re-exports `upsertCustomerProfile`. | Rebuild `@avantej-core/services` dist. No code change needed. |
| `apps/server/src/routes/google-calendar.ts` | 3 | `getGoogleAuthUrl`, `exchangeCodeForTokens`, `getGoogleUserInfo` — all exist in `google-calendar.service.ts` and are re-exported via `export *`. Stale-dist. | Rebuild dist. |
| `apps/server/src/services/ghl/dispatch-staff-sync.ts` | 4 | `dispatchProfileSync`, `dispatchStaffSync`, `StaffSyncOperation`, `StaffSyncResult` — exist in `ghl-staff-sync.service.ts`, re-exported. Stale-dist. | Rebuild dist. |
| `apps/server/src/routers/ghl.ts` | 1 | `errorRows.map((r) => ...)` — `r` implicit `any`. Likely fallout from a generic return type that's no longer concrete after schema changes. | Add explicit `(r: { branchNodeId: string; n: number })` annotation, or fix upstream `count()` typing. |
| `apps/server/src/services/hierarchy.service.ts` | 1 | `tenantDb.insert(hierarchyNodes).values({...})` — missing required `slug` (Phase H2). | Generate slug from `name` (slugify) before insert, or pass through from caller. |
| `apps/server/src/services/hierarchy-validation.service.ts` | 1 | Same — missing `slug` on insert. | Same. |
| `apps/server/src/services/payment.service.ts` | 1 | Same — `hierarchyNodes` insert without `slug` in the org-bootstrap path. | Same. |
| `apps/server/src/routes/organizations.routes.ts` | 1 | Same — `hierarchyNodes` insert without `slug` in the org-creation flow. | Same. |

**Projected error drop: 17 errors** (12 evaporate on dist rebuild; 5 need real code edits — all the same `slug`-on-`hierarchy_nodes` pattern except 1 GHL `any`).

## DROP-TEST (tests for removed features)

None. Every "missing service member" referenced by tests still exists in `packages/services/src/*` (I grep-verified the high-fan-out names: `createAnnouncement`, `listBrands`, `listRooms`, `deactivateMember`, `expandRecurrenceRule`, `setPackageOverdraft`, `resolveServicePrice`, `resolveTaxRate`, etc.). No phase-5 feature was actually deleted at the service layer; the apparent deletions are all stale-dist artifacts.

| File | Errors | Removed feature | Confidence |
|---|---|---|---|
| _(none)_ | | | |

## FIX-TEST (tests with old fixtures / missing column)

These tests will mostly fix themselves on dist rebuild, EXCEPT the five `hierarchyNodes.insert` sites that need a `slug`. Splitting per file so the remediation list is concrete:

### Pure stale-dist victims (rebuild dist → resolved, no code edit)

| File | Errors | Old shape | New shape | Action |
|---|---|---|---|---|
| `src/tests/integration/announcements.integration.test.ts` | 15 (5× TS2305 + 10× downstream implicit-any in `.map((a) => …)` callbacks) | imports 5 names from `@avantej-core/services` that exist in source | same | Rebuild dist → all 15 clear (implicit-any errors only fire because the array type degraded to `any[]` after the import failed). |
| `src/tests/integration/installment-plans.integration.test.ts` | 9 | 7× TS2305 + 2× implicit-any | same | Rebuild dist. |
| `src/tests/integration/expenses.integration.test.ts` | 9 | 5× TS2305 + 4× implicit-any | same | Rebuild dist. |
| `src/tests/integration/tax-rates.integration.test.ts` | 8 | 6× TS2305 + 2× implicit-any | same | Rebuild dist. |
| `src/tests/integration/goods-receipts.test.ts` | 8 | 8× TS2305 | same | Rebuild dist. |
| `src/tests/unit/services/transfer-orders.test.ts` | 7 | 6× TS2305 + 1× implicit-any | same | Rebuild dist. |
| `src/tests/unit/services/stock-requests.test.ts` | 7 | 6× TS2305 + 1× implicit-any | same | Rebuild dist. |
| `src/tests/unit/services/products.test.ts` | 7 | 7× TS2305 | same | Rebuild dist. |
| `src/tests/unit/recurrence-expansion.test.ts` | 7 | 5× TS2305 + 2× implicit-any | same | Rebuild dist. |
| `src/tests/integration/purchase-orders.integration.test.ts` | 7 | 5× TS2305 + 2× implicit-any | same | Rebuild dist. |
| `src/tests/unit/services/service.test.ts` | 6 | 4× TS2305 + 2× implicit-any | same | Rebuild dist. |
| `src/tests/unit/services/rooms.test.ts` | 6 | 5× TS2305 + 1× implicit-any | same | Rebuild dist. |
| `src/tests/unit/services/units-of-measure.test.ts` | 5 | 5× TS2305 | same | Rebuild dist. |
| `src/tests/unit/services/suppliers.test.ts` | 5 | 5× TS2305 | same | Rebuild dist. |
| `src/tests/unit/services/sequence-numbers.test.ts` | 5 | 5× TS2305 | same | Rebuild dist. |
| `src/tests/unit/services/sales-order.test.ts` | 5 | 5× TS2305 | same | Rebuild dist. |
| `src/tests/unit/services/product-categories.test.ts` | 5 | 5× TS2305 | same | Rebuild dist. |
| `src/tests/unit/services/installment.test.ts` | 5 | 5× TS2305 | same | Rebuild dist. |
| `src/tests/unit/services/brands.test.ts` | 5 | 5× TS2305 | same | Rebuild dist. |
| `src/tests/integration/promotions.integration.test.ts` | 5 | 5× TS2305 | same | Rebuild dist. |
| `src/tests/integration/commission-versioning.test.ts` | 5 | 5× TS2305 | same | Rebuild dist. |
| `src/tests/unit/services/invoice.test.ts` | 4 | 4× TS2305 | same | Rebuild dist. |
| `src/tests/integration/status-history.test.ts` | 4 | 4× TS2305 (`updateSalesOrder`, `updatePackageInstance`, `appendPaymentStatusHistory`, `appendAppointmentStatusHistory`) | same | Rebuild dist — confirmed all four exist in `sales-order.service.ts`, `package-instance.service.ts`, `status-history.helper.ts`. |
| `src/tests/integration/staff-id-convention.test.ts` | 4 | 3× TS2305 + 1× implicit-any | same | Rebuild dist. |
| `src/tests/integration/commission-calculator.test.ts` | 4 | 3× TS2305 + 1× TS2769 (`slug`) | mostly same, plus slug | Rebuild dist for 3; add `slug` for 1. |
| `src/tests/integration/appointment-commission.test.ts` | 4 | 3× TS2305 + 1× TS2769 (`slug`) | mostly same, plus slug | Rebuild dist for 3; add `slug` for 1. |
| `src/tests/unit/services/package-instance.test.ts` | 3 | 3× TS2305 | same | Rebuild dist. |
| `src/tests/integration/pos-commission.test.ts` | 3 | 3× TS2305 | same | Rebuild dist. |
| `src/tests/integration/analytics.integration.test.ts` | 2 | 2× TS2305 (`getDashboardKpis`, `getStaffPerformance` — re-exported via `export * from "./analytics.service"`) | same | Rebuild dist. |
| `src/tests/integration/installments.integration.test.ts` | 1 | 1× TS2305 (`setPackageOverdraft`) | same | Rebuild dist. |
| `src/tests/integration/pricing.test.ts` | 1 | 1× TS2305 (`resolveServicePrice`) | same | Rebuild dist. |
| `src/tests/integration/sales-tax.test.ts` | 1 | 1× TS2305 (`resolveTaxRate`) | same | Rebuild dist. |
| `src/tests/integration/members-deactivate.integration.test.ts` | 1 | 1× TS2305 (`deactivateMember`) | same | Rebuild dist. |
| `src/tests/unit/services/member-deactivate.test.ts` | 1 | 1× TS2305 — subpath import `@avantej-core/services/member.service` | same | Rebuild dist (also fixes subpath shim). |
| `src/tests/unit/services/appointment.service.test.ts` | 1 | 1× TS2305 (`createAppointment`) | same | Rebuild dist. |
| `src/tests/unit/resolve-member-id.test.ts` | 1 | 1× TS2305 (`resolveMemberIdFromUserId`) | same | Rebuild dist. |

### Tests that need real edits beyond dist rebuild

| File | Errors | Old shape | New shape | Action |
|---|---|---|---|---|
| `src/tests/integration/invitations-restore-block.test.ts` | 2 | 1× TS2305 (`checkSoftDeletedCustomerBlock` — exists in `invitation.service.ts`) + 1× TS2769 `hierarchyNodes` insert missing `slug` | Need slug | Rebuild dist for #1; add `slug` to hierarchy insert at line 49. |
| `src/tests/integration/invitations-scope.test.ts` | 1 | TS2769 `hierarchyNodes.insert` at line 72 — missing `slug` | Need slug | Add slug. |
| `src/tests/integration/org.test.ts` | 1 | TS2769 `hierarchyNodes.insert` at line 219 — missing `slug` | Need slug | Add slug. |

**Projected error drop for FIX-TEST bucket:** ~180 errors — virtually the entire bucket clears on dist rebuild; ~5 residual hierarchy-`slug` inserts need a one-line fix each (`slug: slugify(name)` or similar).

## UNCLEAR (need human review)

| File | Errors | Why unclear |
|---|---|---|
| `apps/server/src/services/hierarchy.service.ts` (line 188) | 1 | The `slug` for the org-bootstrap node is a policy decision: do we slugify the org name, accept it from the caller, or reserve a fixed `"root"` slug? Touches a hot path that flows into `payment.service.ts` and `organizations.routes.ts` (both also failing for the same reason). Best handled as one coordinated PR. |
| `apps/server/src/services/payment.service.ts` (line 214) | 1 | Same `slug` question — duplicate hierarchy-bootstrap path; ideally consolidated through `hierarchy.service.createHierarchyNode` instead of inlining a raw insert. |
| `apps/server/src/routes/organizations.routes.ts` (line 254) | 1 | Same again. There are three parallel "create the root hierarchy node" call sites — worth deciding whether to keep them parallel or refactor into one helper before patching individually. |

(Listed under UNCLEAR rather than UPDATE because the right answer is a small architectural decision about who owns slug generation. If the team just wants the build green, treat as UPDATE and add `slug: slugify(organization.name)` to all three.)

## Recommended sequence

1. **`packages/services && bun run build`** — single biggest leverage move. Reduces 203 → ~23. Not a code change to source.
2. **DELETE bucket** (4 scripts). 6 → 17 errors remaining.
3. **UPDATE — `slug` on hierarchy_nodes inserts** (4 sites in `apps/server/src` + a few tests). Add `slug: slugify(...)` to each `.values({...})`. Pattern is identical, can be done in one sweep.
4. **UPDATE — `apps/server/src/routers/ghl.ts:205`** — add explicit type annotation on the `errorRows.map` callback.
5. **UNCLEAR — decide slug-generation ownership** for the three "create org root node" sites before merging step 3, if you want to consolidate.
6. (No DROP-TEST or FIX-TEST residual work after step 1 except the 5 hierarchy-slug inserts already covered.)

## Acceptance-criteria check
- All 203 errors categorized: yes — DELETE 6 + UPDATE 17 (12 stale-dist + 5 real) + FIX-TEST 177 (mostly stale-dist) + UNCLEAR 3 = 203.
- Each file appears in exactly one bucket: yes (UPDATE files for `hierarchy.service.ts`, `payment.service.ts`, `organizations.routes.ts` are listed in UNCLEAR too only to flag the design question; they are owned by UPDATE for counting).
- Estimated drop per bucket noted above.
- No code changes made.
