-- Migration 0063: add default_commission_bps to services
-- Stores default commission rate in basis points (e.g. 1000 = 10.00%).
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS default_commission_bps integer NOT NULL DEFAULT 0;
