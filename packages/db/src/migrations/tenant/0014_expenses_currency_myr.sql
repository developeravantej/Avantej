-- Mixed-but-naturally-idempotent migration:
--   * UPDATE expenses ... WHERE currency = 'usd'  -> NOVEL data correction; idempotent
--     by predicate (no-op once all rows are 'myr').
--   * ALTER TABLE expenses ALTER COLUMN currency SET DEFAULT 'myr'  -> duplicate of
--     0016_worried_wolfpack, but SET DEFAULT is idempotent in PostgreSQL.
-- Safe to re-run on tenants past the historical baseline.
UPDATE expenses SET currency = 'myr' WHERE currency = 'usd';
--> statement-breakpoint
ALTER TABLE expenses ALTER COLUMN currency SET DEFAULT 'myr';
