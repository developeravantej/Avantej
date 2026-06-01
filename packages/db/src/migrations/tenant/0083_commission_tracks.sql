-- migration: 0083_commission_tracks
-- description: Introduce commission_tracks model. Existing trainer commission
--   becomes a "delivery track" — behaviour-preserving (trainers still earn
--   exactly as today). This is the schema half (Agent C); service wiring in
--   Agent D (Phase 2 services). All DDL is idempotent.
--
-- Tasks: #10 (enums), #11 (new tables + additive columns), #12 (index swap),
--        #13 (backfill + legacy commission_splits backfill).
--
-- FINDINGS — live CHECK on commission_splits:
--   * 0024 created two-way XOR (appointment XOR sales_order).
--   * 0034 widened to one-of-three (appointment | sales_order | package_instance).
--   * 0046 re-created as "commission_splits_source_check" (one-of-three, same logic).
--   * 0052 relaxed: manual splits may have 0-or-1 source; automated splits
--     must have exactly 1. Live constraint name: "commission_splits_source_check".
--   * NO CHANGE — existing sources (appointment_id, sales_order_id,
--     package_instance_id) are still the originators. The Phase 3 stacking of
--     a sales-track split on the SAME sales_order row is already permitted
--     (sales_order_id IS NOT NULL satisfies the exactly-1 rule). The unique
--     index swap below (Task #12) is the only enforcement change needed.

-- ============================================================
-- SECTION 1 — New tables (Task #11)
-- ============================================================

-- 1.1 commission_tracks
CREATE TABLE IF NOT EXISTS commission_tracks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL means org-scoped; NOT NULL means category-scoped
    category_id     uuid REFERENCES service_categories(id) ON DELETE RESTRICT,
    scope           text NOT NULL DEFAULT 'category',    -- CommissionTrackScope
    role_type       text NOT NULL DEFAULT 'trainer',     -- CommissionRoleType
    trigger         text NOT NULL DEFAULT 'on_completion', -- CommissionTrigger
    basis           text NOT NULL DEFAULT 'delivery_total', -- CommissionBasis
    payment_type    text NOT NULL DEFAULT 'variable',    -- CommissionPaymentType
    pool_policy     text NOT NULL DEFAULT 'separate',    -- CommissionPoolPolicy
    max_beneficiaries int NOT NULL DEFAULT 1,
    max_per_cycle_cents int,                             -- NULL = uncapped
    cap_amount_cents    int,                             -- per-split cap
    floor_amount_cents  int,                             -- per-split floor
    exclude_if_discount_above_pct int,                  -- basis points threshold
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commission_tracks_category_idx
    ON commission_tracks(category_id);

CREATE INDEX IF NOT EXISTS commission_tracks_scope_role_idx
    ON commission_tracks(scope, role_type);

CREATE INDEX IF NOT EXISTS commission_tracks_active_idx
    ON commission_tracks(is_active);

-- 1.2 commission_track_rates
CREATE TABLE IF NOT EXISTS commission_track_rates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id    uuid NOT NULL REFERENCES commission_tracks(id) ON DELETE CASCADE,
    tier_id     uuid NOT NULL REFERENCES trainer_tiers(id) ON DELETE RESTRICT,
    -- For payment_type='fixed': cents (e.g. 5000 = RM 50).
    -- For payment_type='variable': basis points (e.g. 1000 = 10%).
    amount      int NOT NULL,
    CONSTRAINT commission_track_rates_track_tier_unique UNIQUE (track_id, tier_id)
);

CREATE INDEX IF NOT EXISTS commission_track_rates_track_idx
    ON commission_track_rates(track_id);

-- 1.3 commission_track_versions
CREATE TABLE IF NOT EXISTS commission_track_versions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id       uuid NOT NULL REFERENCES commission_tracks(id) ON DELETE CASCADE,
    version_number int NOT NULL,
    snapshot       jsonb NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT commission_track_versions_track_version_unique UNIQUE (track_id, version_number)
);

CREATE INDEX IF NOT EXISTS commission_track_versions_track_idx
    ON commission_track_versions(track_id);

-- ============================================================
-- SECTION 2 — Additive columns on existing tables (Task #11)
-- ============================================================

-- 2.1a trainer_tiers: add role_type column (NOT a rename — avoids FK drift)
ALTER TABLE trainer_tiers
    ADD COLUMN IF NOT EXISTS role_type text NOT NULL DEFAULT 'trainer';

-- 2.1b commission_coach_slots: add nullable track_id alongside existing config_id
--   (config_id NOT dropped here — Agent D wires the handover)
ALTER TABLE commission_coach_slots
    ADD COLUMN IF NOT EXISTS track_id uuid REFERENCES commission_tracks(id) ON DELETE SET NULL;

-- Partial unique index on (track_id, slot_index) for the new track-based path.
-- The old (config_id, slot_index) index "coach_slots_config_slot_unique" is kept.
DO $$ BEGIN
    CREATE UNIQUE INDEX commission_coach_slots_track_slot_unique
        ON commission_coach_slots(track_id, slot_index)
        WHERE track_id IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 2.2 commission_splits: nullable track columns (all NULL for pre-migration rows)
ALTER TABLE commission_splits
    ADD COLUMN IF NOT EXISTS track_id          uuid REFERENCES commission_tracks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS role_type         text,
    ADD COLUMN IF NOT EXISTS track_version_id  uuid REFERENCES commission_track_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS commission_splits_track_idx
    ON commission_splits(track_id);

-- ============================================================
-- SECTION 3 — Backfill (Task #13)
-- ============================================================
-- For each category_commission_configs row, create one delivery track (trainer,
-- on_completion, delivery_total). Idempotent: skips if a trainer track already
-- exists for the category. Also backfills coach slots, tier rates, a version
-- snapshot, and legacy split rows.

DO $$
DECLARE
    cfg             RECORD;
    new_track_id    uuid;
    new_version_id  uuid;
BEGIN
    FOR cfg IN
        SELECT
            c.id          AS config_id,
            c.category_id,
            c.payment_type,
            c.max_per_cycle_cents,
            c.cap_amount_cents,
            c.floor_amount_cents,
            c.exclude_if_discount_above_pct
        FROM category_commission_configs c
    LOOP
        -- Skip if a trainer delivery track already exists for this category
        IF EXISTS (
            SELECT 1 FROM commission_tracks
            WHERE category_id = cfg.category_id
              AND role_type    = 'trainer'
              AND trigger      = 'on_completion'
        ) THEN
            CONTINUE;
        END IF;

        -- Insert the delivery track
        INSERT INTO commission_tracks (
            category_id, scope, role_type, trigger, basis,
            payment_type, pool_policy, max_beneficiaries,
            max_per_cycle_cents, cap_amount_cents,
            floor_amount_cents, exclude_if_discount_above_pct,
            is_active
        )
        VALUES (
            cfg.category_id, 'category', 'trainer', 'on_completion', 'delivery_total',
            cfg.payment_type, 'separate', 1,
            cfg.max_per_cycle_cents, cfg.cap_amount_cents,
            cfg.floor_amount_cents, cfg.exclude_if_discount_above_pct,
            true
        )
        RETURNING id INTO new_track_id;

        -- Repoint coach slots for this config to the new track
        UPDATE commission_coach_slots
        SET track_id = new_track_id
        WHERE config_id = cfg.config_id;

        -- Copy tier rates from commission_tier_rates → commission_track_rates
        INSERT INTO commission_track_rates (track_id, tier_id, amount)
        SELECT new_track_id, trainer_tier_id, amount
        FROM commission_tier_rates
        WHERE config_id = cfg.config_id
        ON CONFLICT (track_id, tier_id) DO NOTHING;

        -- Snapshot a version row from the active config
        INSERT INTO commission_track_versions (track_id, version_number, snapshot)
        VALUES (
            new_track_id,
            1,
            jsonb_build_object(
                'category_id',                   cfg.category_id,
                'config_id',                     cfg.config_id,
                'payment_type',                  cfg.payment_type,
                'max_per_cycle_cents',            cfg.max_per_cycle_cents,
                'cap_amount_cents',               cfg.cap_amount_cents,
                'floor_amount_cents',             cfg.floor_amount_cents,
                'exclude_if_discount_above_pct',  cfg.exclude_if_discount_above_pct,
                'backfilled_at',                 now()
            )
        )
        ON CONFLICT (track_id, version_number) DO NOTHING
        RETURNING id INTO new_version_id;

        -- Backfill legacy commission_splits rows that belong to this category's
        -- appointments (via appointment → service → category path).
        -- Uses sales_order_id path too, where the order has a service in this category.
        -- track_version_id uses the first version we just created.
        UPDATE commission_splits cs
        SET
            track_id         = new_track_id,
            role_type        = 'trainer',
            track_version_id = new_version_id
        WHERE cs.track_id IS NULL
          AND (
              -- appointment path: appointment → appointment_staff → service → service_category
              (cs.appointment_id IS NOT NULL AND EXISTS (
                  SELECT 1
                  FROM appointments a
                  JOIN services s ON s.id = a.service_id
                  WHERE a.id = cs.appointment_id
                    AND s.category_id = cfg.category_id
              ))
              OR
              -- sales_order path: sales_order → sales_order_items → service → service_category
              (cs.sales_order_id IS NOT NULL AND EXISTS (
                  SELECT 1
                  FROM sales_order_items soi
                  JOIN services sv ON sv.id = soi.service_id
                  WHERE soi.sales_order_id = cs.sales_order_id
                    AND sv.category_id = cfg.category_id
                  LIMIT 1
              ))
          );

    END LOOP;
END $$;

-- ============================================================
-- SECTION 4 — Relax stacking constraints (Task #12)
-- ============================================================
-- CRITICAL: Without the track dimension, a sales split stacked on a delivery
-- split for the same (order, staff) hits 23505 and is silently dropped —
-- violating "commission must reach earners in all cases."
--
-- Note on 23505 handler: persist.ts catches any 23505 generically; it does
-- NOT check constraint/index names, so renaming these indexes is safe.

-- 4.1 Sales-order dimension: drop old 2-column partial index, add 3-column
DROP INDEX IF EXISTS commission_splits_so_staff_unique;

DO $$ BEGIN
    CREATE UNIQUE INDEX commission_splits_so_track_staff_unique
        ON commission_splits(sales_order_id, track_id, staff_id)
        WHERE sales_order_id IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 4.2 Appointment dimension: drop old 2-column partial index, add 3-column
DROP INDEX IF EXISTS commission_splits_appt_staff_unique;

DO $$ BEGIN
    CREATE UNIQUE INDEX commission_splits_appt_track_staff_unique
        ON commission_splits(appointment_id, track_id, staff_id)
        WHERE appointment_id IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- CHECK constraint verdict:
--   Live constraint is "commission_splits_source_check" (from 0052).
--   Rule: manual splits 0-or-1 source; automated exactly-1 source.
--   Phase 3 sales-track splits fire on sales_order_id (automated) —
--   already satisfies the exactly-1 rule. NO CHANGE to the CHECK.
