# Schema Drift Audit
**Session:** 05-30_15-23_commission-tracks
**Findings:** 11 (2 critical · 3 high · 3 medium · 1 low · 2 info)

## Findings

### [CRITICAL] Existing `commission_splits_so_staff_unique` index blocks track stacking
**Plan claims:** A trainer's delivery split AND a closer's sales split can both exist for the same sales order (Journey B "stacked on the trainer's delivery split"); a new partial unique `commission_splits(sales_order_id, track_id, staff_id) WHERE track_id IS NOT NULL` enforces per-track idempotency (Task 3.4).
**Actual:** Migration 0024 already created `CREATE UNIQUE INDEX commission_splits_so_staff_unique ON commission_splits(sales_order_id, staff_id) WHERE sales_order_id IS NOT NULL`. This index permits **only one row per (sales_order_id, staff_id)** regardless of track. If a staff member is both the delivery trainer and the closer on the same order, the second insert fails with `23505` and the 23505-skip-on-duplicate handler will SILENTLY DROP the second commission — violating the core invariant "commission must reach earners in all cases." The plan never relaxes or drops this index.
**File:** packages\db\src\migrations\tenant\0024_commission_splits_status.sql:17-19
**Fix:** In the Phase 3 migration, DROP `commission_splits_so_staff_unique` and replace with a track-aware partial unique `(sales_order_id, staff_id, track_id)` (treating legacy NULL track_id as its own bucket via `COALESCE` or a separate partial index), so delivery and sales splits for the same staff/order coexist.
---

### [CRITICAL] `commission_coach_slots.configId → trackId` repoint is a destructive FK swap on live tenants
**Plan claims:** "coach slots repointed to the new trackId" / "REPLACED BY trackId uuid → commission_tracks" (§3.3, Task 2.2). Listed as MEDIUM-ish "FK repoint" in the impact table.
**Actual:** `commission_coach_slots.configId` is `NOT NULL` with `.references(() => categoryCommissionConfigs.id, { onDelete: "cascade" })` and a `coach_slots_config_slot_unique` unique index on `(configId, slotIndex)`. Repointing requires: add nullable `trackId`, backfill from the new track, then either drop `configId` (breaks the existing cascade + unique index + all `commission-calculator.service.ts` reads) or keep both. The plan does not specify a safe column-coexistence transition and the existing `coach_slots_config_slot_unique` index would need to become `(trackId, slotIndex)`. A half-applied repoint breaks commission calc for that tenant mid-rollout.
**File:** packages\db\src\schema\tenant\commission-coach-slots.ts:6-8,14
**Fix:** Make this additive — add nullable `track_id` + new `(track_id, slot_index)` unique index, backfill, keep `config_id` until all readers migrate (Phase 4), then drop in a later migration. Sequence reads-then-writes across deploys.
---

### [HIGH] Migration number placeholder "NNNN" — next free number is 0082
**Plan claims:** `packages/db/src/migrations/tenant/NNNN_commission_tracks.sql` (Task 2.1).
**Actual:** Latest authored migration is `0081_credit_point_ledger.sql`; the generated registry `tenant-migrations.generated.ts` ends at hash `0081_credit_point_ledger`. The next free number is **0082**. Note there are existing duplicate-number collisions in this folder (two 0004s, 0005s, 0011s, etc., from a parallel-branch history) — do NOT reuse a low number; continue the high sequence.
**File:** packages\db\src\generated\tenant-migrations.generated.ts:4538
**Fix:** Author `0082_commission_tracks.sql` (and `0083_…`, `0084_…` for the Phase 3 sales-attribution and origination-index migrations); run `bun gen:migrations` + `bun verify:migrations` after each.
---

### [HIGH] `trainer_tiers → earner_tiers` rename: FK survives, but Drizzle shim + name-uniqueness must be handled
**Plan claims:** rename `trainer_tiers`→`earner_tiers`, add `roleType DEFAULT 'trainer'`, idempotent; "single riskiest migration"; keep a re-export shim (Task 2.3, Open Q4).
**Actual:** `members.trainerTierId` FK → `trainerTiers.id` (`onDelete: "set null"`) and `commission_tier_rates.trainerTierId` FK → `trainerTiers.id` both target the **PK** (valid unique constraint), so a PostgreSQL `ALTER TABLE ... RENAME TO` preserves these FKs automatically — the rename itself does NOT break the FKs (the plan over-states this risk). The real hazards: (a) idempotency — `ALTER TABLE trainer_tiers RENAME TO earner_tiers` is NOT idempotent and errors if re-run on an already-migrated tenant; must wrap in a `DO $$ ... IF EXISTS(...trainer_tiers...) THEN ... END $$` guard. (b) The `trainer_tiers_name_unique` / `trainer_tiers_name_idx` / `trainer_tiers_rank_idx` index names do NOT auto-rename and will keep the old `trainer_tiers_*` prefix unless explicitly `ALTER INDEX ... RENAME`. (c) Adding `roleType` makes the existing `trainer_tiers_name_unique` (on `name` alone) semantically wrong — two roleTypes can't share a tier name; consider `(name, roleType)`.
**File:** packages\db\src\schema\tenant\trainer-tiers.ts:3,12-14 ; packages\db\src\schema\tenant\members.ts:42
**Fix:** Idempotent guarded rename + explicit `ALTER INDEX` renames; reconsider the `name` unique index to include `roleType`; keep the Drizzle re-export shim as planned.
---

### [HIGH] `earner_tiers` name unique is an INDEX not a CONSTRAINT — fine for the planned FK, but flag the rule
**Plan claims:** "rates hang off a track, keyed by tier" with `commission_track_rates.tierId uuid → earner_tiers` (§3.3).
**Actual:** The planned FK targets `earner_tiers.id` (the PK), which has a true unique constraint — so this FK is VALID. No violation. BUT the project rule "FK only when target has a unique CONSTRAINT (not just unique index)" is live here: `trainer_tiers.name` has only `uniqueIndex("trainer_tiers_name_unique")` (an INDEX, not a constraint). Any future FK keyed on tier *name* (not id) would be invalid. The plan's id-keyed FKs are safe; calling this out so the implementer keys on `tierId`, never `name`.
**File:** packages\db\src\schema\tenant\trainer-tiers.ts:14
**Fix:** Keep all track→tier FKs keyed on `earner_tiers.id`. No change needed; documented guardrail.
---

### [MEDIUM] `commission_splits` has NO `track_id` / `roleType` / `trackVersionId` today — and configVersionId cap-join must be preserved
**Plan claims:** add nullable `trackId`, `roleType`, `trackVersionId`; treat NULL roleType as "delivery (legacy)"; per-track cap aggregate uses `trackVersionId` INNER JOIN analog while `configVersionId` path keeps working (§3.3, Task 2.5).
**Actual:** Confirmed `commission_splits` currently has `configVersionId` (FK → `category_commission_config_versions.id`, `onDelete restrict`, line 53) and `trainerTierId` (snapshot, no FK, line 83) — both as the plan states. None of `track_id`/`role_type`/`track_version_id` exist yet. The cap aggregate's silent-exclusion trap (a NULL version id drops the split from the per-cycle cap) is real and correctly flagged. The `trackVersionId` FK should target `commission_track_versions.id` (a PK — valid).
**File:** packages\db\src\schema\tenant\commission-splits.ts:53,83
**Fix:** Add the three nullable columns + index `commission_splits(track_id)`; in `applyCommissionCaps`, branch on COALESCE(track_version_id, config_version_id) so neither legacy nor new splits fall out of the cap aggregate.
---

### [MEDIUM] `net_order` basis assumption — `sales_orders.totalAmount` discount semantics unverified
**Plan claims:** `net_order = sales_orders.totalAmount` "verify this is post-discount; if not, derive net from line items minus promotions" (Task 3.3, Open Q1).
**Actual:** `sales_orders.totalAmount integer NOT NULL` exists (line 35) and `cancelledAmount`/`refundedAmountCents` exist as the plan's clawback formula needs (lines 42, 60). Discount data lives on `payment_items.promotionId` (FK → promotions, line 29), so deriving net from line-items-minus-promotions is structurally possible. Whether `totalAmount` is already net is a service-layer/data question this schema audit can't settle — correctly raised as a blocking open question.
**File:** packages\db\src\schema\tenant\sales-orders.ts:35,42,60 ; packages\db\src\schema\tenant\payment-items.ts:29
**Fix:** Resolve Open Q1 before Phase 3.3 by inspecting how `totalAmount` is computed in `pos.service`; the clawback formula `-paid × refundedAmountCents / totalAmount` is sound given these columns.
---

### [MEDIUM] `sales_orders.soldBy` / `leadSourceUserId` are net-new — plan correct, naming nit
**Plan claims:** add `soldBy text NULL` + `leadSourceUserId text NULL` to `sales_orders`, index `soldBy`, no backfill (Task 3.1).
**Actual:** Neither column exists today. `sales_orders` already has `createdBy text NOT NULL` (line 29) and a `sales_orders_created_by_idx`. Plain `text` (no FK) for cross-DB user refs is the correct project convention — good. Note a `lead_sources` table already exists (`packages\db\src\schema\tenant\lead-sources.ts`); `leadSourceUserId` as a free-text *user* ref is distinct from that table — make sure the naming doesn't imply an FK to `lead_sources` (it's a user, per Journey B "Lead source" person).
**File:** packages\db\src\schema\tenant\sales-orders.ts:29
**Fix:** Add both as plain `text` nullable; index `soldBy`; document that `leadSourceUserId` is a members.userId (no FK), unrelated to the `lead_sources` catalog table.
---

### [LOW] `category_commission_configs` cap/floor/exclude fields the plan copies — all present
**Plan claims:** the new `commission_tracks` copies `paymentType`, `maxPerCycleCents`, `capAmountCents`, `floorAmountCents`, `excludeIfDiscountAbovePct` from `category_commission_configs` (§3.3, Task 2.2).
**Actual:** All five confirmed present: `paymentType` (line 9), `maxPerCycleCents` (15), `excludeIfDiscountAbovePct` (20), `capAmountCents` (24), `floorAmountCents` (25). Also `maxCoaches` (11) and `isConditional` (10) exist if the track model needs them. `category_commission_config_versions` mirrors the same cap/floor fields (lines 51-57), so the planned `commission_track_versions` snapshot can mirror them 1:1.
**File:** packages\db\src\schema\tenant\category-commission-configs.ts:9-25
**Fix:** None — copy mapping is accurate. `commission_tracks` should NOT carry `maxCoaches` as a per-track field unless delivery-specific (plan uses `maxBeneficiaries` instead — reasonable rename).
---

### [INFO] No proposed index name collides with an existing index
**Plan claims:** new indexes `commission_tracks(categoryId)`, `commission_tracks(scope,roleType)`, `commission_track_rates(trackId)`, `commission_track_versions(trackId,versionNumber)`, `sales_orders(soldBy)`, `commission_splits(track_id)`, partial unique `commission_splits(sales_order_id,track_id,staff_id)`.
**Actual:** Grep across `packages/db/src` found zero existing indexes named `commission_tracks_*`, `commission_track_rates_*`, `commission_track_versions_*`, `sales_orders_sold_by_*`, or `commission_splits_track_*`. No collision. (The existing `commission_splits_so_staff_unique` is a different name but a functional conflict — see CRITICAL #1.)
**File:** packages\db\src\schema\tenant\ (whole-folder grep)
**Fix:** None — choose explicit, prefixed index names in the migration to keep the convention.
---

### [INFO] Enum columns as `text` (not pg enums) — matches existing convention
**Plan claims:** scope/roleType/trigger/basis/poolPolicy modeled as `text` columns, not pg enums (§3.3).
**Actual:** Consistent with the codebase: `category_commission_configs.paymentType`, `commission_splits.status`/`earnReason`/`splitType` are all plain `text` with comment-documented value sets. (Note: `sales_orders` DOES use real `pgEnum` for `refundStatus` and `cancellationReasonCategory`, so both patterns exist — but for commission the `text` convention is dominant and the plan follows it.)
**File:** packages\db\src\schema\tenant\category-commission-configs.ts:9 ; packages\db\src\schema\tenant\commission-splits.ts:67,86,105
**Fix:** None — use `text` + CHECK constraints (optional) for the new enum-like columns, consistent with `commission_splits`.
---

## Summary
The plan's schema model is largely sound and its table/column references are accurate: `sales_orders` has `totalAmount`/`cancelledAmount`/`refundedAmountCents`, `commission_splits` has `configVersionId` and `trainerTierId`, `category_commission_configs` carries all the cap/floor/exclude/paymentType fields the plan copies, and the proposed FKs all target primary keys (valid unique constraints) so none violate the "FK needs a unique CONSTRAINT" rule — the cross-DB user refs are correctly plain `text`. Two issues are blocking. First (CRITICAL), the plan's signature feature — stacking a sales commission on top of a delivery commission for the same staff/order — is blocked by the pre-existing `commission_splits_so_staff_unique` partial index from migration 0024, which the plan never relaxes; left unfixed, the 23505-skip handler will silently drop the second earner's commission. Second (CRITICAL), the `commission_coach_slots.configId → trackId` repoint is described as additive but is a destructive `NOT NULL` FK + unique-index swap on live Neon branches that needs an explicit coexistence transition. Beyond those: the "NNNN" placeholder must become **0082** (latest is 0081), and the `trainer_tiers → earner_tiers` rename — while its FKs actually survive a Postgres `RENAME` (the plan over-states FK-break risk) — needs idempotency guards, explicit `ALTER INDEX` renames, and reconsideration of the `name`-only unique index now that `roleType` is added. Index-name collisions: none. Enum-as-text and the `net_order` derivation path are consistent with the codebase, with the `totalAmount`-is-net question correctly left as a blocking pre-Phase-3 open item.
