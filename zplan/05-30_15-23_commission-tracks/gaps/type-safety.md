# Type Safety Audit
**Session:** 05-30_15-23_commission-tracks
**Findings:** 13 (1 C · 3 H · 5 M · 2 L · 2 I)

## Findings

### [CRITICAL] Plan re-declares `StaffAssignment` with a structure already exported by `commission-math.ts` — collision risk in shared `commission/` modules
**Plan claims:** §3.1 lists `StaffAssignment` among the "New internal types (Phase 1)" inside `PlanInput.assignments: StaffAssignment[]`, and 1.2 says `plan.ts` "reuses `commission-math.ts` verbatim".
**Actual:** `StaffAssignment` is already an **exported** interface in `packages/services/src/commission-math.ts:22` (`{ staffId: string; slotIndex: number }`) and is **also locally re-declared** (non-exported) in `commission-calculator.service.ts:46`. The new `context.ts`/`plan.ts` will import math helpers from `commission-math.ts` (which exports `StaffAssignment`, `SlotConfig`). If `plan.ts` *also* declares its own `interface StaffAssignment` AND imports the one from `commission-math.ts`, that is a duplicate-identifier `TS2300` (or a shadow that diverges silently). The plan's `StaffAssignment` is structurally identical to the existing one, so the correct move is to **import and reuse** `commission-math.ts`'s exported `StaffAssignment` — NOT re-declare it. The plan presents it as "new," which if taken literally produces a redeclaration that fails `bun check-types`.
**File:** packages/services/src/commission-math.ts:22 (existing export); plan.md:92-100 (re-declaration); commission-calculator.service.ts:46 (existing local dup)
**Fix:** In §3.1, state explicitly: "reuse the exported `StaffAssignment` and `SlotConfig` from `commission-math.ts`; do NOT re-declare." Delete the local `interface StaffAssignment` at calculator:46 when the entry points are rewritten in 1.4. `MemberSnapshot`, `RateTable`, `PlannedSplit`, `SkipReason`, `CommissionContext`, `PlanInput` are genuinely new and collide with nothing in `packages/types/src/` or the services layer.

---

### [HIGH] `members.trainer_tier_id` has a REAL Drizzle FK to `trainerTiers.id` — the rename to `earner_tiers` is not a metadata-only change
**Plan claims:** §6 breakage table treats the `trainer_tiers`→`earner_tiers` rename as mitigable with "idempotent rename + re-export shim in Drizzle"; §8 Q4 calls it "the single riskiest migration." The Drizzle re-export shim (2.3) is presented as the type-safety fix.
**Actual:** `packages/db/src/schema/tenant/members.ts:42` declares `trainerTierId: uuid("trainer_tier_id").references(() => trainerTiers.id, { onDelete: "set null" })` — a real, generated FK constraint (not cross-DB text). `members.ts:23` imports `trainerTiers` directly. A Drizzle **re-export shim** (`export { earnerTiers as trainerTiers }`) keeps TypeScript happy but does NOT rename the underlying Postgres FK target; `ALTER TABLE trainer_tiers RENAME TO earner_tiers` in Postgres auto-updates the dependent FK, but `drift-check.yml` compares the *generated* schema (which would now reference `earner_tiers`) against live, so the shim must keep the table-name string `"trainer_tiers"` on the renamed `pgTable(...)` or drift-check flags a missing/extra FK. This is a financial/auth-adjacent constraint (tier → rate → payout). The plan's mitigation is under-specified for the FK.
**File:** packages/db/src/schema/tenant/members.ts:42; plan.md:295, 343
**Fix:** In 2.3, specify the shim must (a) keep `pgTable("trainer_tiers", …)` as a re-export name OR rename the pgTable string to `"earner_tiers"` AND update `members.ts`'s `.references(() => earnerTiers.id)` import in the same PR, and (b) regenerate ERD + run `bun scripts/check-drift.ts` so the FK on `members.trainer_tier_id` is verified to still resolve. Strongly consider §8 Q4's documented alternative (additive `roleType` on `trainer_tiers`, NO rename) to avoid touching this FK on live tenants entirely.

---

### [HIGH] New text-enum columns (`scope`, `roleType`, `trigger`, `basis`, `paymentType`, `poolPolicy`) have no planned exported TS union — diverges from the codebase's documented-union convention
**Plan claims:** §3.3 documents the allowed values inline (e.g. `roleType text NOT NULL // "trainer" | "sales" | "marketing" | "referrer"`) but §3, Phase 2 (2.3), and Phase 3 list no TS union type to mirror them. The codebase convention (per the audit brief and `commission.ts`) is text column + a single exported union (`CommissionEarnReason`).
**Actual:** `packages/db/src/schema/tenant/commission-splits.ts:105` stores `earnReason` as plain `text` and `packages/types/src/commission.ts:15` exports the matching `CommissionEarnReason` union, re-exported via `packages/types/src/index.ts:9`. The plan adds **six** new text enums across `commission_tracks` plus a denormalized `roleType` on `commission_splits` (line 188) and `roleType` on `earner_tiers` (line 158), but defines no `CommissionRoleType`, `CommissionTrackBasis`, `CommissionTrackTrigger`, `CommissionTrackScope`, `CommissionPoolPolicy` unions. Without them, `$inferSelect.roleType` is typed `string`, every planner `switch (roleType)` loses exhaustiveness checking, and Zod `z.enum([...])` literals (router input) will silently drift from the DB-comment values. This is HIGH because `roleType`/`basis` gate which money formula runs.
**File:** packages/types/src/commission.ts (where unions belong); plan.md:136-159, 188
**Fix:** Add a Phase-2 task to define in `packages/types/src/commission.ts`: `CommissionRoleType = "trainer"|"sales"|"marketing"|"referrer"`, `CommissionTrackTrigger = "on_completion"|"on_sale"`, `CommissionTrackBasis = "delivery_total"|"gross_order"|"net_order"|"flat"`, `CommissionTrackScope = "category"|"org"|"product"`, `CommissionPoolPolicy = "separate"|"shared"`, `CommissionPaymentType = "fixed"|"variable"`. Re-export from index.ts. Use them in Drizzle `text(...).$type<CommissionRoleType>()`, in Zod `z.enum([...] satisfies readonly CommissionRoleType[])`, and in planner switches with a `never` default for exhaustiveness.

---

### [HIGH] `as unknown as` cast pattern already present in the two files the planner touches; origination router risks the documented AppRouter instantiation-depth blowup
**Plan claims:** Phase 3 adds a `packages/api/src/routers/commission-tracks/` folder module merged into `appRouter`, plus `calculateOriginationCommission`. The plan does not mention the cold-build `appRouter` instantiation-depth issue.
**Actual:** Two `tx as unknown as TenantDb` casts exist in `commission-splits.service.ts:964` and `:1347` (passing a transaction handle where the function signature wants `TenantDb`). The refactor's `persistSplits(db, …)` will run inside `appointment.service.ts`'s `tx` transactions (see `appointment.service.ts:355` already casting `tx as unknown as TenantDb`), so the new `persist.ts` will need the same cast — it propagates an existing `TenantDb | TenantTx` typing weakness rather than fixing it. Separately, MEMORY.md documents that adding routers to the merged `appRouter` literal can exceed the TS instantiation-depth limit on a cold `tsc -b`, fixed via `export const appRouter = _appRouter as unknown as AppRouter`. Adding a new `commission-tracks` folder router (3.5) plus the server-only `calculateOriginationCommission` type stub is exactly the kind of merge that re-triggers it.
**File:** commission-splits.service.ts:964,1347; appointment.service.ts:355; plan.md:198, 271
**Fix:** (a) Have `persist.ts`/`context.ts` accept `TenantDb | TenantTx` and do ONE narrow internal cast (mirror existing pattern) rather than forcing callers to cast — and document it. (b) Add an acceptance note to Phase 3: after merging `commission-tracks` into `appRouter`, run a **cold** `tsc -b` (delete `.tsbuildinfo`/dist first) to confirm the `_appRouter as unknown as AppRouter` indirection still absorbs the new router; if a new server-only router type stub is added, register it in `packages/api/src/routers/_types/server-router-types.ts` per CLAUDE.md.

---

### [MEDIUM] `commission_splits.roleType` is nullable but the plan's "treat NULL as delivery/legacy" rule is only stated for grouping — not applied to the planner switch, payout, or liability segmentation
**Plan claims:** §6 breakage row says readers "must treat NULL `roleType` as 'delivery (legacy)'." §3.3 line 188 marks `roleType text NULL`.
**Actual:** The rule is asserted once (review grouping) but Phase 4 (4.2) says `liabilitySummary`/`liabilityByStaff`/`listCommissionLedger` "aggregate AND segment by `trackId`/`roleType`" with no NULL-coalescing rule. `listPendingReview` currently `SELECT *`s and maps rows (commission-splits.service.ts:2426-2438) with no `roleType` field at all yet — when added, `r.roleType` is `string | null` and any `GROUP BY roleType` SQL will produce a distinct NULL bucket unless coalesced. Pre-migration rows (all historical splits) have NULL, so without `COALESCE(role_type, 'trainer')` the liability CSV and review groups will show a phantom "(none)" track alongside "Delivery," and the "owed" invariant could double-count.
**File:** commission-splits.service.ts:2396-2438 (listPendingReview), :1036/:1570/:1750 (liability/ledger); plan.md:188, 282, 298
**Fix:** Add a single shared rule to §3.3/§7: "all reads of `commission_splits.roleType` coalesce NULL→'trainer'; all reads of `trackId` tolerate NULL (legacy delivery)." Apply in SQL (`COALESCE(role_type,'trainer')` in GROUP BY) AND in the TS mapping layer, not just review grouping.

---

### [MEDIUM] `trackVersionId` cap-aggregate INNER JOIN inherits the exact `configVersionId IS NULL` silent-exclusion trap for ALL pre-migration rows
**Plan claims:** 2.5 / §6: "update `applyCommissionCaps` to aggregate per `trackId` via the `trackVersionId` INNER JOIN analog; keep `configVersionId` path working for historical rows." §6 acknowledges "A NULL `trackVersionId` would silently drop a split from the cap aggregate."
**Actual:** Current `applyCommissionCaps` (commission-splits.service.ts:434-446) `.innerJoin(categoryCommissionConfigVersions, eq(commissionSplits.configVersionId, …))`. Every existing split has `trackVersionId = NULL` (new nullable column, line 188). If the per-track cap query INNER JOINs on `trackVersionId`, **100% of historical splits drop out of the per-track aggregate** — the cap resets to 0 for every trainer at migration cutover, silently letting them exceed the monthly ceiling. The plan says "keep `configVersionId` path working for historical rows" but a split cannot be counted by BOTH a `configVersionId` join and a `trackVersionId` join in one aggregate without a `LEFT JOIN ... COALESCE` or a `UNION`. This is a money-correctness MEDIUM (caps under-enforced), bordering HIGH.
**File:** commission-splits.service.ts:426-446; plan.md:258, 297
**Fix:** Specify the exact query shape in 2.5: either (a) backfill `trackVersionId` for all migrated historical splits in 2.2 so the INNER JOIN is safe, or (b) use a `LEFT JOIN` on both version tables and aggregate on `COALESCE(track_version_id, config_version_id)` category resolution. State which. Do NOT leave it as "analog."

---

### [MEDIUM] `sales_orders.soldBy`/`leadSourceUserId` nullable — no stated null-guard for the origination planner beneficiary resolution
**Plan claims:** 3.1 adds `soldBy text NULL` + `leadSourceUserId text NULL`, "leave NULL for history." 3.3 origination planner takes "the resolved beneficiary (closer / lead source)." §7 says "Origination with no resolved beneficiary → emit a `SkipReason`."
**Actual:** Good — the SkipReason path is specified. But `PlannedSplit.staffId` is typed `string` (plan.md:103, non-nullable) while the beneficiary source (`soldBy`) is `string | null`. The planner must narrow `soldBy: string | null` → `string` before constructing a `PlannedSplit`, or emit `SkipReason`. The plan describes the behavior but the type contract (`PlannedSplit.staffId: string`) will force a non-null assertion or a guard at the boundary. Flagging so the implementer adds an explicit `if (!soldBy) return skip` guard rather than `soldBy!`.
**File:** plan.md:103, 267, 269, 311
**Fix:** In 3.3 state: "origination planner signature takes `soldByUserId: string | null`; if null, push `SkipReason{reason:'no_beneficiary'}` and return — never `!`-assert into `PlannedSplit.staffId`." Add `"no_beneficiary"` to the `SkipReason.reason` union (currently only delivery reasons listed at plan.md:109-111).

---

### [MEDIUM] `SkipReason.reason` union is delivery-only — origination/sales skip reasons not in the type
**Plan claims:** §3.1 `SkipReason.reason` = `"no_coach_slot" | "member_not_found" | "role_mismatch" | "no_tier" | "no_tier_rate" | "no_condition_rate"`. §7 says origination emits skip reasons for missing beneficiary; §3.3 implies basis-resolution failures.
**Actual:** The Phase-1 `SkipReason` union has no member for the Phase-3 origination paths (no beneficiary, no track rate for sales tier, basis-unresolvable). If `origination-plan.ts` reuses the same `SkipReason` type (the plan shares the persist/skip tail), `reason: "no_beneficiary"` is a `TS2322` against the closed union. Either the union must be widened in Phase 3 or `origination-plan.ts` needs its own reason type.
**File:** plan.md:107-111, 269, 311
**Fix:** Widen the `SkipReason.reason` union in Phase 3 to include `"no_beneficiary" | "no_track_rate" | "basis_unresolvable"`, or make `reason: string` with documented constants. Decide in §3.1 vs 3.3 so the shared persist tail compiles.

---

### [MEDIUM] Zod input schemas vs Drizzle column types: cap/rate/weightage fields must be `z.number().int()`, not `z.string()`; the plan does not pin this for the new track config router
**Plan claims:** Domain brief: "Amounts are integer cents; weightages are basis points; never floats." 3.5 adds `upsertTrack`/`setTrackRates`/`setCoachSlots` oRPC procedures (TanStack Form). §3.3 columns: `maxPerCycleCents int`, `capAmountCents int`, `floorAmountCents int`, `excludeIfDiscountAbovePct int`, `commission_track_rates.amount int`, `commission_coach_slots.weightageBasisPoints int`.
**Actual:** All these map to Drizzle `integer(...)` (cents / basis points). The plan never states the Zod input types. Frontend forms commonly bind number inputs as strings; if the new procedures use `z.string()` or `z.coerce.number()` without `.int()`, fractional or string cents reach the integer columns → either a runtime PG error or a silent float-truncation in money. Existing convention (e.g. `commission-splits.service.ts` cents fields) is integer. This is a MEDIUM because it's a plan omission on the money boundary, not a confirmed bug.
**File:** plan.md:144-167, 271 (config router); cross-ref commission-splits.ts integer columns
**Fix:** Pin in 3.5: every cents/bp field uses `z.number().int().nonnegative()` (nullable caps via `.nullable()`), enum fields use `z.enum([...] satisfies readonly CommissionRoleType[])`, and the form layer converts RM→cents with `rmToCents` (per MEMORY `apps/web/src/lib/amount.ts`) before submit. Reject `z.coerce`/`z.string()` on money fields.

---

### [LOW] `RateTable` is described as a union ("tier rates OR conditions+condition-rates") but given no discriminant in the plan
**Plan claims:** §3.1 `rates: RateTable; // tier rates OR conditions+condition-rates`.
**Actual:** The existing engine branches on `config.isConditional` (calculator:111, :240) to choose `tierRates: {trainerTierId, amount}[]` vs `conditionRates: {trainerTierId, amount, conditionId}[]`. A `RateTable` modeled as a bare union `TierRate[] | ConditionRate[]` cannot be narrowed at the use-site without re-reading `isConditional`. Without a discriminant field the planner will need a cast or a redundant flag.
**File:** plan.md:88, 106-109; calculator:106-109, 235-238
**Fix:** Define `RateTable` as a discriminated union: `{ kind: "tier"; rates: TierRate[] } | { kind: "conditional"; conditionId: string|null; rates: ConditionRate[] }`. Lets `plan.ts` switch on `.kind` with no DB re-read.

---

### [LOW] `PlannedSplit.conditionId: string | null` vs `commission_splits.conditionId` uuid — fine, but `trainerTierId: string` (non-null) conflicts with the nullable DB column on the sales path
**Plan claims:** §3.1 `PlannedSplit { … trainerTierId: string; … conditionId: string | null }`.
**Actual:** `commission_splits.trainerTierId` is `uuid(...)` **nullable** (commission-splits.ts:83) and `conditionId` is `uuid(...)` nullable (:82) — consistent for conditionId. But `PlannedSplit.trainerTierId: string` (non-null) assumes every planned split has a tier. For sales/marketing tracks the earner may have no `trainerTierId` (it's a *trainer* tier; a sales rep maps to an `earner_tiers` row of `roleType='sales'`). The plan reads `trainerTierId` "as the generic tierId going forward" (line 188) but keeps the type non-null `string`, which will break for non-trainer earners whose tier may be unresolved → forces `?? ""` or `!`.
**File:** plan.md:103, 188; commission-splits.ts:83
**Fix:** Type `PlannedSplit.tierId: string | null` (rename from `trainerTierId` to match "generic tierId" intent) and insert into the still-named `trainer_tier_id` column nullable. Avoids a non-null assertion on the sales/marketing path.

---

### [INFO] `CommissionContext.configVersionId: string | undefined` matches existing `resolvedConfigVersionId` typing — no conflict
**Plan claims:** §3.1 `CommissionContext { … configVersionId: string | undefined }`.
**Actual:** Matches calculator:495 `resolvedConfigVersionId = latestVersion?.id ?? undefined` and `getLatestConfigVersionForCategory` returning `string | null` (commission-splits.service.ts:1925). One minor mismatch: the existing helper returns `null`, the new type uses `undefined`. Drizzle insert accepts both for a nullable uuid. No action required beyond consistency.
**File:** plan.md:91; commission-splits.service.ts:1925; commission-calculator.service.ts:495
**Fix:** None required. Optionally normalize on `undefined` throughout `CommissionContext` for consistency with the insert payloads.

---

### [INFO] `MemberSnapshot` / `Map<string, MemberSnapshot>` mirrors the existing pre-fetch map type — no collision
**Plan claims:** §3.1 `PlanInput.members: Map<string, MemberSnapshot>; // pre-fetched by loader (role, tier)`.
**Actual:** Matches the existing inline map type at calculator:382-387 `Map<string, { userId; role; trainerTierId: string | null }>`. `MemberSnapshot` is new, collides with no existing exported type. Confirm `MemberSnapshot.tier`/`trainerTierId` is typed `string | null` to match `members.trainerTierId` nullability (members.ts:42).
**File:** plan.md:94; commission-calculator.service.ts:382
**Fix:** None required. Type `MemberSnapshot.trainerTierId: string | null` to match the source column.

---

## Summary

The plan is largely type-sound, but six items need plan-level fixes before implementation to avoid `bun check-types` failures or money/auth-field unsafe casts:

- **CRITICAL (1):** `StaffAssignment` is already an exported interface in `commission-math.ts` — the plan must reuse it, not re-declare it, or the new `plan.ts` produces a duplicate-identifier error. The other six "new" interfaces (CommissionContext, PlanInput, PlannedSplit, SkipReason, RateTable, MemberSnapshot) collide with nothing.
- **HIGH (3):** (a) the `trainer_tiers`→`earner_tiers` rename touches a **real Drizzle FK** on `members.trainer_tier_id` — the re-export shim alone won't satisfy drift-check; (b) six new text enums (roleType/basis/trigger/scope/poolPolicy/paymentType) have **no planned exported TS union**, breaking the codebase's `CommissionEarnReason` convention and planner exhaustiveness; (c) `as unknown as TenantDb` casts already exist in the touched files and will propagate into `persist.ts`, and the new `commission-tracks` router risks re-triggering the documented cold-build `appRouter` instantiation-depth blowup.
- **MEDIUM (5):** NULL `roleType`/`trackId` "treat as delivery" rule is stated for grouping only, not for liability/payout/planner; the `trackVersionId` INNER JOIN will silently drop 100% of pre-migration splits from the per-track cap aggregate (caps under-enforced at cutover); `soldBy` null-guard and origination `SkipReason` members are undefined; Zod money-field types (`z.number().int()`) unpinned for the new config router.
- **LOW (2):** `RateTable` needs a discriminant; `PlannedSplit.trainerTierId` should be `string | null` (generic `tierId`) for non-trainer earners.

Recommended gating fixes before Phase 1: the CRITICAL (reuse `StaffAssignment`) and HIGH-b (define the unions in `packages/types/src/commission.ts`). The HIGH-a FK-rename risk supports adopting §8 Q4's documented additive-`roleType`-without-rename alternative.
