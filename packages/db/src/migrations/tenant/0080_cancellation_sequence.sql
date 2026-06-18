-- Migration: 0080 — tenant_cancellation_seq (F-SALE-09)
-- generateCancellationNumber() used COUNT(*)+1 over existing cancellation
-- numbers, which races under concurrent cancellations (two cancellations can
-- read the same count and mint duplicate CAN-YYYYMMDD-NNNN numbers). Switch to a
-- DB sequence (same pattern as tenant_sales_order_seq) so number allocation is
-- atomic. The date prefix still groups by day; the sequence is globally
-- monotonic (numbers do not reset daily — uniqueness is the guarantee, not
-- per-day reset).
--
-- Idempotent: re-runs on partially-migrated tenants are safe.

CREATE SEQUENCE IF NOT EXISTS "tenant_cancellation_seq";
