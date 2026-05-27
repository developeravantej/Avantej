# Domain 01-commission-engine — Commission Rule Engine & Calculation

Scope: configuration of commission rules per service category (slots / weightages
/ tier-rates / conditional rates), auto-calculation of splits on appointment
completion + POS sale, lifecycle (pending → approved → paid / void), caps and
discount-threshold opt-outs, manual adjustments, refund reversal, and read /
analytics surface (ledger + liability summaries).

## Endpoints / Procedures

### packages/api/src/routers/category-commission.ts

| Name           | Auth                                                        | Purpose                                                                                                                                                          | Logic fn                                |
|----------------|-------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------|
| `getByCategory`| tenantProcedure + `category_commission_management:read`     | Fetch a category's commission config (slots / rates / conditions) for the admin form.                                                                            | `getCategoryCommissionConfig`           |
| `upsert`       | tenantProcedure + `category_commission_management:create`   | Replace the entire commission config for a category (delete-then-insert) — validates slot weightages sum to 10 000 bp and condition intervals do not overlap. | `upsertCategoryCommissionConfig`        |
| `delete`       | tenantProcedure + `category_commission_management:delete`   | Hard-delete the config row for a category. Throws if none found.                                                                                                  | `deleteCategoryCommissionConfig`        |

Registered as `categoryCommission.*` in `packages/api/src/routers/base-router.ts:110`.

### packages/api/src/routers/commission-splits/read.procedures.ts

| Name              | Auth                                                            | Purpose                                                                                                                          | Logic fn                          |
|-------------------|-----------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|-----------------------------------|
| `list`            | tenantProcedure + `commission_management:read`                  | Filterable list of commission splits scoped by `accessibleNodeIds` via JOIN to appointments + sales orders.                       | `listCommissionSplits`            |
| `getByAppointment`| tenantProcedure + `commission_management:read`                  | All splits for one appointment, ordered by amount; rejects when appointment branch outside scope.                                 | `getCommissionsByAppointment`     |
| `myCommissions`   | tenantProcedure + `commission_management:read`                  | Caller's own splits with `totalAmount` summary.                                                                                  | `getMyCommissions`                |
| `listLedger`      | tenantProcedure + `commission_management:read`                  | Enriched ledger with status filter, branch filter, totals (pending/approved/paid). Paginated. Powers the Commissions table UI. | `listCommissionLedger`            |

### packages/api/src/routers/commission-splits/analytics.procedures.ts

| Name                | Auth                                                                                  | Purpose                                                                                                                       | Logic fn          |
|---------------------|---------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|-------------------|
| `liabilitySummary`  | tenantProcedure + (`commission_management:read` OR `commission_payout:read`)          | Aggregate trainer-level liability for a `[from, to]` window; optional hierarchy + category filter; enriches names from CP.    | `liabilitySummary` |
| `liabilityByStaff`  | tenantProcedure + `commission_management:read`                                        | GROUP-BY-staffId summation of pending/approved/paid cents, RBAC-scoped + optional branch filter. LIMIT 500.                    | `liabilityByStaff` |

## Logic Functions

### packages/services/src/commission-math.ts
- `assertConfigSumIs10000(allSlots, configId)` — throw if configured slot weightages don't sum to exactly 10 000 bp. Allows empty config.
- `dedupeBySlotIndex(assignments)` — de-duplicate staffAssignments by `slotIndex`; returns `{deduped, hadDuplicates}`.
- `computeEffectiveWeightages(allSlots, validAssignments)` — redistribute unclaimed bp evenly across present coaches with deterministic remainder.
- `computeFinalAmountCents(baseAmountCents, effectiveWeightage, quantity)` — multiply-then-floor (Fix #1) to bound rounding loss to <1 cent.

### packages/services/src/commission-calculator.service.ts
- `calculateCommissionForAppointment(...)` — appointment-completion path; insert one `commission_splits` row per eligible trainer (requireTrainerRole=true).
- `calculateCommissionForPos(...)` — POS / sales-order path; quantity-tier matching (`minQuantity DESC`, NULL = catch-all); requireTrainerRole=false.
- `_buildSplits(...)` (internal) — shared per-staff loop: dedupe, redistribute weightage, pre-check eligibility, look up rate, compute amount, apply caps, insert split, audit.

### packages/services/src/commission-splits.service.ts
- `listCommissionSplits(...)` — paginated filter for the legacy list view (RBAC via OR(appt.branch ∈ scope, so.branch ∈ scope)).
- `getCommissionsByAppointment(...)` — splits for a single appointment; branch-scope check via a separate query before fetching.
- `getMyCommissions(...)` — current user's splits + totalAmount. Note: filters `createdAt` (not `earnedAt`).
- `resolveCategoryIdForSplit(...)` (internal) — appointment → service.categoryId; package_instance → service.categoryId; sales_order → first non-excluded line.
- `computeOrderDiscountBps(...)` (internal) — discount fraction in bp relative to GROSS order total.
- `getCycleBoundsForDate(...)` (internal) — calendar-month UTC window for per-cycle cap.
- `applyCommissionCaps(...)` — opt-out by discount threshold, then enforce `maxPerCycleCents`. Returns `{skip, amountCents, reason}`.
- `createCommissionSplit(...)` — insert a single split via `onConflictDoNothing`; runs comp/excluded guard + caps; audits.
- `approveCommissionSplits(...)` — bulk pending→approved; FOR UPDATE lock; invariants: same staff + ≤31-day span; per-row audit.
- `markCommissionSplitsPaid(...)` — bulk approved→paid; optional `payoutId`.
- `voidCommissionSplit(...)` — single (any non-paid) → void; idempotent on already-void.
- `voidCommissionSplitsForSalesOrder(...)` — bulk void on sales-order cancel; skips splits whose linked appointment is completed/cancelled/no_show.
- `liabilitySummary(...)` — bucketed totals per trainer over `earnedAt` window; category filter joins via appointments and EXISTS over `sales_order_items`.
- `markPaidBatch(...)` — bulk paid update by staff + earnedAt window; one audit row per affected member. **ORPHAN** (no procedure exposes it — `commissions.markPaidBatch` mutator lives elsewhere and there is no caller within owned files).
- `createManualAdjustment(...)` — insert manual split with `pending_review` if `|amount| ≥ RM500`, else `pending`. Duplicate guard on (staff, appointment, manual, non-void).
- `liabilityByStaff(...)` — GROUP BY staffId with conditional sums; LIMIT 500; RBAC + branch filter via LEFT JOIN.
- `listCommissionLedger(...)` — paginated enriched rows + totals (status-bucketed) over the full filtered set.
- `getLatestConfigVersionForCategory(...)` — fetch latest immutable version id for audit anchoring. **ORPHAN within owned files** (no caller in `_buildSplits` / `createCommissionSplit`).
- `getOrCreatePayoutBatch(...)` — idempotent batch resolver for finance.
- `attachPayoutsToBatch(...)` — wire payouts to a batch.
- `reverseForRefund(db, refundId, params)` — refund-driven reversal: pro-rate by `creditsRefunded / creditsTotal` for partial package refunds, else full reversal up to unreversed remainder.
- `listPendingReview(...)` — high-value manual adjustments awaiting review; cursor pagination.
- `resolvePendingReview(...)` — approve (→ pending) or reject (→ void); branch-scope check on the earner's `hierarchyScopeId`.

### packages/services/src/category-commission.service.ts
- `getCategoryCommissionConfig(tenantDb, categoryId)` — fetch config + slots + (rates | per-condition rates). **Does not filter `isActive`**.
- `toHalfOpen(...)` (internal) — operator → half-open interval for overlap detection.
- `intervalsOverlap(...)` (internal).
- `upsertCategoryCommissionConfig(...)` — DELETE config (cascades slots/rates/conditions) then INSERT; validates `slotSum===10000` and condition overlap. Does NOT set `isActive` explicitly.
- `deleteCategoryCommissionConfig(...)` — hard-delete by categoryId; throws if none. **Cannot soft-deactivate.**

### packages/services/src/trainer-tier.service.ts
- `listTrainerTiers({includeInactive})` — list ordered by rank.
- `createTrainerTier(...)` — insert tier + scaffold zero-amount stub rows in every active non-conditional `commission_tier_rates`. Returns `{tier, missingRateCategories}`.
- `updateTrainerTier(...)` — patch with case-insensitive name uniqueness check.
- `deactivateTrainerTier(...)` — `isActive=false`. **ORPHAN** (no procedure or service calls it).
- `deleteTrainerTier(...)` — null out `members.trainerTierId` then hard delete.
- `reactivateTrainerTier(...)` — `isActive=true` + return `missingRateCategories`.
- `assignTierToMember(...)` — set `members.trainerTierId`. Trainer-role check.
- `getConfigsMissingRateForTier(...)` — list configs lacking a rate for this tier (N×M serial queries — see P2).

## Gaps (prioritized P1/P2/…)

### P1 — `upsertCategoryCommissionConfig` is a destructive DELETE+INSERT that orphans/breaks historical splits and resets soft-delete state. (packages/services/src/category-commission.service.ts:153-220) [status: partial | testable: true]

`upsertCategoryCommissionConfig` always `DELETE`s `categoryCommissionConfigs` for the given `categoryId` and re-INSERTs with default `isActive=true` (line 159-166). Three concrete problems:
1. Re-insert never sets `isActive` explicitly, so a previously deactivated config is silently reactivated on any edit (line 158-166).
2. Cascading delete drops the row referenced by `commission_splits.configId` / the immutable `category_commission_config_versions` history if any FK relies on the parent config existing — the only "versioning" hook (`getLatestConfigVersionForCategory`) reads from `category_commission_config_versions`, which is presumably populated by a DB trigger on insert; an UPDATE never fires "insert", so versions only accumulate on hard re-creates (good), but historical splits' `configVersionId` snapshots still point at the *old* config row which has been deleted, breaking dispute reproducibility.
3. Concurrent calls (two admins saving at once) can race between DELETE and INSERT — no `FOR UPDATE` lock and no transaction-level uniqueness on `categoryId` enforces serialization; the second writer can observe an empty result and silently overwrite.

Reproduce: open category commission editor, save, then immediately save again; or via API: call `categoryCommission.upsert` twice in parallel for the same categoryId — observe one config row but no audit linkage to the prior version.

persistence: { tenant: ctx.organizationId, table: "category_commission_configs", where: { categoryId }, expect: { isActive: true, paymentType, maxCoaches } }

### P1 — `getCategoryCommissionConfig` ignores `isActive`, allowing deactivated configs to power the admin form even though the calculator skips them. (packages/services/src/category-commission.service.ts:22-65) [status: partial | testable: true]

The read query has no `WHERE isActive=true` (line 26-29) but `commission-calculator.service.ts:88-96` and the cap resolver (`commission-splits.service.ts:355-362`) both filter on `isActive=true`. Result: an admin who edits a deactivated category sees "stale" rules in the UI; if they save, the destructive upsert path reactivates the row (see prior gap), silently changing payment behaviour without an explicit toggle. Reproduce: directly toggle `isActive=false` in DB, fetch via `categoryCommission.getByCategory`, observe the row is still returned to the UI.

persistence: { tenant: ctx.organizationId, table: "category_commission_configs", where: { categoryId, isActive: false }, expect: { /* should be filtered out but is returned */ } }

### P1 — `deleteCategoryCommissionConfig` hard-deletes config used by historical splits, breaking audit & dispute trail. (packages/services/src/category-commission.service.ts:223-237) [status: partial | testable: true]

Logic is `DELETE FROM category_commission_configs WHERE category_id=$1` with no check for downstream `commission_splits` referencing the (snapshot-only via `configVersionId`, but resolved-by-categoryId in `applyCommissionCaps`) rules. There is no soft-delete option and no guard against deleting a config that has unpaid/approved splits — any future cap evaluation or version-resolution will return nulls and silently skip caps. Reproduce: create config → generate a split → DELETE config → run `applyCommissionCaps` for that staff/order → expected to bail with no cap; actual: bails with no cap (logical silent loss of guardrail).

persistence: { tenant: ctx.organizationId, table: "category_commission_configs", where: { categoryId }, expect: { /* row removed */ } }

### P1 — No router exposes mutation surface for commission lifecycle/manual adjustments via owned files; routers exist elsewhere but owned `commission-splits/*` only ship `read` and `analytics`. (packages/api/src/routers/commission-splits/read.procedures.ts + analytics.procedures.ts) [status: partial | testable: false]

The owned router files do not export `approveCommissionSplits`, `markCommissionSplitsPaid`, `voidCommissionSplit`, `createManualAdjustment`, `markPaidBatch`, `reverseForRefund`, `listPendingReview`, `resolvePendingReview`, or any `categoryCommission` lifecycle action. Sibling `lifecycle.procedures.ts` and `review.procedures.ts` exist outside the owned set; the gap to flag here is that this audit's owned surface is read-only, so any UI-driven testing of approval/paid/void flows must go through the sibling files. Not directly testable from the owned surface, but the dependency is fragile: if those siblings are renamed or unregistered, the owned analytics rely on data only those mutations produce.

### P1 — Pre-cycle cap uses calendar-month UTC bounds that are *not* aligned to the eventual payout-batch window, so splits earned on month boundaries can over- or under-cap relative to the actual payroll cycle. (packages/services/src/commission-splits.service.ts:296-301, 386-426) [status: partial | testable: true]

`getCycleBoundsForDate` always returns UTC `[start of month, start of next month)` (lines 296-301), but `getOrCreatePayoutBatch` accepts an arbitrary `periodStart/periodEnd` (lines 1677-1718). If finance defines a payout period 22nd→22nd, every split earned 1st-21st of month N is capped against split totals in month N (calendar) — those totals include splits that will be paid in the *previous* batch. Trainer receives less than `maxPerCycleCents` in the real cycle; nothing ever surfaces the discrepancy. Reproduce: configure `maxPerCycleCents=10000` for a category, post one split on the 22nd, advance to next month's 1st, post another → calendar bounds reset, but if payout batch is e.g. 22nd→22nd, trainer earned cap *plus* whatever was unpaid → audit note will say "capped" but trainer paid in payout batch.

persistence: { tenant: ctx.organizationId, table: "commission_splits", where: { staffId, earnedAt ∈ calendarMonth }, expect: { calculatedAmount ≤ maxPerCycleCents } }

### P2 — `getMyCommissions` filters by `createdAt`, not `earnedAt`, contradicting the rest of the service that consistently filters by `earnedAt`. (packages/services/src/commission-splits.service.ts:163-195, esp. 176-181) [status: partial | testable: true]

`liabilitySummary`, `liabilityByStaff`, and `markPaidBatch` all filter on `earnedAt` (e.g. lines 988-991, 1319-1320, 1182-1183). `getMyCommissions` filters on `createdAt` (lines 176, 180). A split for a session delivered last month but reconciled today shows in the *current* month's "My Commissions" page — inconsistent with the trainer's own payroll period. Reproduce: insert a split with `earnedAt` 30 days ago, `createdAt` today, then call `commissionSplits.getMyCommissions` with `from=startOfToday` → row appears even though it's payroll for last month.

persistence: { tenant: ctx.organizationId, table: "commission_splits", where: { staffId=memberId, createdAt ∈ window }, expect: { /* should filter earnedAt */ } }

### P2 — `liabilitySummary` `to` filter is `lte(earnedAt, to)` — an inclusive upper bound on a timestamp drops nothing but creates off-by-one when callers pass a date-only `to`. (packages/services/src/commission-splits.service.ts:988-991) [status: partial | testable: true]

Caller in `analytics.procedures.ts:22-29` passes `from`, `to` as `z.string().datetime()` — i.e. timestamps. But the UI typically passes `2026-05-01T00:00:00Z` for the *exclusive* end of April; `lte` includes any split with exactly that timestamp, double-counting first-of-month splits in both periods. Use `lt` for consistency with `applyCommissionCaps` `end` semantics (line 392-406 uses `< end`). Reproduce: post a split with `earnedAt = '2026-05-01T00:00:00Z'`; call `liabilitySummary` for {from=2026-04-01, to=2026-05-01} *and* {from=2026-05-01, to=2026-06-01} — the split appears in both totals.

persistence: { tenant: ctx.organizationId, table: "commission_splits", where: { earnedAt = boundary }, expect: { /* appears in only one bucket */ } }

### P2 — POS conditional-rates path has a silent fall-through when no condition matches `minQuantity`. (packages/services/src/commission-calculator.service.ts:244-269) [status: partial | testable: true]

When `config.isConditional=true` and *no* condition matches `params.quantity` (all `minQuantity` are NOT NULL and exceed the quantity), `_buildSplits` is never called and the function returns `[]` with **no audit row and no console warn** (line 255-258). Appointment path writes both a warn and short-circuits (lines 148-157); POS does neither. Operators have no breadcrumb when a POS sale completes silently with zero commissions. Reproduce: configure a conditional commission with all conditions requiring `minQuantity ≥ 5`; sell qty=1; observe order completes, no commission rows, no audit, no log.

persistence: { tenant: ctx.organizationId, table: "audit_logs", where: { entityType: "commission_split", action: "commission.skip" }, expect: { /* row exists with reason */ } }

### P2 — `applyCommissionCaps` looks up an *active* config by categoryId but the calculator path snapshots the config-version it actually evaluated; cap evaluation can race against a config change mid-cycle. (packages/services/src/commission-splits.service.ts:349-362 vs commission-calculator.service.ts:86-100) [status: partial | testable: true]

`_buildSplits` reads `categoryCommissionConfigs` once and uses it for everything. The cap path inside the SAME `_buildSplits` calls `applyCommissionCaps` (line 601-608) which re-reads `categoryCommissionConfigs` and may load a *different* active config if another admin saved in between (recall P1: upsert is delete-then-insert and reactivates). Result: amount computed with config A, capped against config B. Reproduce: race two admins editing the config while a POS sale completes — observe `commission_splits.notes` referencing a cap value that doesn't correspond to the snapshot fields stored on the same row.

persistence: { tenant: ctx.organizationId, table: "commission_splits", where: { staffId, earnedAt }, expect: { weightageBasisPoints + baseAmountCents consistent with notes' cap reference } }

### P2 — N+1 query in `getConfigsMissingRateForTier` for conditional configs. (packages/services/src/trainer-tier.service.ts:237-309, esp. 252-307) [status: partial | testable: false]

Outer loop iterates all active configs (line 252). For conditional configs, inner loop iterates each condition id (line 284-300) issuing one SELECT per condition, and short-circuits only when a rate is found. For an org with 30 conditional configs × 5 conditions each, this is 150 round trips. Replace with a single GROUP BY query joining `commission_conditions` + `commission_condition_rates`.

### P2 — `categoryCommission.upsert` permission check is hard-coded to action `"create"` even for update flows; `delete` action is correct but there is no `"update"` permission. (packages/api/src/routers/category-commission.ts:77) [status: partial | testable: false]

Upsert always invokes `requirePermissionOrpc(..., "category_commission_management", "create")`. A user with "update" granted but not "create" cannot edit an existing config — and there is no `update` action at all in the permission catalogue grep. Either widen the upsert grant to accept `create` OR `update`, or split into separate create + update procedures with appropriate actions.

### P2 — `liabilitySummary` permission OR-check pattern is bespoke and silently swallows errors. (packages/api/src/routers/commission-splits/analytics.procedures.ts:36-55) [status: partial | testable: false]

Two `try/catch` blocks each catching everything and setting `hasPermission = true` only on the happy path. Any *non-permission* error inside `requirePermissionOrpc` (e.g. tenant DB connectivity) is silently swallowed; the caller sees an opaque FORBIDDEN even though the underlying issue is unrelated. The codebase's other OR-checks use `hasAnyPermission`-style helpers — none here.

### P2 — `voidCommissionSplitsForSalesOrder` query is unbatched and per-row appointment-status lookup. (packages/services/src/commission-splits.service.ts:832-901, esp. 855-876) [status: partial | testable: false]

For each candidate row with `appointmentId`, separately SELECTs appointment status (line 856-862). An order with N delivered sessions = N+1 queries. Replace with a single `IN` lookup.

### P2 — `reverseForRefund` partial-refund pro-rating doesn't account for *which* split the package-instance refund applies to when one instance has multiple splits across staff. (packages/services/src/commission-splits.service.ts:1865-1929) [status: partial | testable: true]

The proration ratio `partialRatios.get(packageInstanceId)` is applied uniformly to every split that points at that `packageInstanceId` (line 1920-1925). If a package instance has 2 trainers, the same fraction is reversed from each — usually correct — but if `creditsRefunded` exceeds one trainer's "share" (e.g. only Trainer A delivered the refunded sessions), Trainer B is still clawed back proportionally. The reversal model treats credits as fungible across splits which doesn't match the per-session attribution model. Reproduce: set up package instance with 10 credits, 2 trainers each delivered 5 sessions, refund 5 credits explicitly tied to Trainer A → both trainers lose 50% of their commission.

persistence: { tenant: ctx.organizationId, table: "commission_split_reversals", where: { refundId }, expect: { amountCents per split proportional to creditsRefunded attribution } }

### P3 — `commission-math` `computeFinalAmountCents` returns 0 for `quantity <= 0` but does not validate non-finite / non-integer inputs. (packages/services/src/commission-math.ts:104-113) [status: partial | testable: false]

Module advertises "All numeric inputs are integers" but only guards `quantity <= 0`. A NaN slips through (`Math.floor(NaN)` → NaN → cents=NaN written to DB). Add a defensive `Number.isInteger` check or assert at the boundary in `_buildSplits`.

### P3 — `liabilityByStaff` `LIMIT 500` is silent — no `nextCursor` or `truncated` flag returned to caller. (packages/services/src/commission-splits.service.ts:1379, 1406) [status: partial | testable: false]

For an org with > 500 active trainers the analytics tab silently drops rows. Either bump the limit or return a `truncated: boolean` signal.

### P3 — `deactivateTrainerTier` is exported but never called. (packages/services/src/trainer-tier.service.ts:137-152) [ORPHAN, status: implemented | testable: false]

No oRPC procedure, service, or test references it. The trainer-tiers router exposes `delete` (hard) and `reactivate` (sets isActive=true) but no `deactivate` (sets isActive=false). Either expose a procedure or remove the function.

### P3 — `markPaidBatch` is exported but the owned router files do not expose it. (packages/services/src/commission-splits.service.ts:1160-1214) [ORPHAN within owned files, status: implemented | testable: false]

A sibling lifecycle/mutator router (outside owned files) is presumed to register it; if so, the test surface for it is not in this domain. Flag for cross-domain audit.

### P3 — `getLatestConfigVersionForCategory` is exported but no caller in owned files uses it; `_buildSplits` does not snapshot a `configVersionId` on inserted rows. (packages/services/src/commission-splits.service.ts:1652-1663 vs commission-calculator.service.ts:619-639) [ORPHAN call-site, status: partial | testable: true]

`_buildSplits` inserts directly without setting `configVersionId` (line 619-639). The audit-trail benefit advertised in the function docstring (dispute reproducibility) is therefore lost for every automatic commission split — only manually created splits via `createCommissionSplit` could set it, and that function accepts a pre-computed `configVersionId` from callers (which none of the owned files supply). Reproduce: complete an appointment → inspect the resulting `commission_splits` row → `configVersionId` is NULL.

persistence: { tenant: ctx.organizationId, table: "commission_splits", where: { appointmentId }, expect: { configVersionId: <latest version row id> } }
