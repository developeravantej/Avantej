-- Denormalized customer name snapshots for read-scaling.
-- Eliminates the per-render cross-DB lookup to the shared control-panel `user`
-- table on appointment and package lists. Populated at create time, refreshed
-- forward-only on customer rename. Nullable so legacy rows fall back to live lookup.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS customer_name text;

ALTER TABLE package_instances
  ADD COLUMN IF NOT EXISTS customer_name text;
