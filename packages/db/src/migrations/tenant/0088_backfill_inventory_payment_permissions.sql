-- Backfill permission rows for resources added after the original tenant seed
-- (inventory, payments read/update/export, sales export, stock_requests, transfer_orders).
--
-- Existing tenants were provisioned before these resources were added to
-- packages/db/src/seeds/permissions.seed.ts, so their `permissions` table is
-- missing these rows. Admin roles (priority >= 100) derive their effective
-- permission list from ALL rows in this table (see apps/server/src/routers/auth.ts),
-- so the missing rows caused tenant admins to be redirected away from the
-- Inventory, UoM, Payment, Installment-plans, Stock-requests and Transfer-orders
-- pages by the frontend route guards (requirePermission).
--
-- Idempotent: ON CONFLICT against the (resource, action) unique constraint.
INSERT INTO "permissions" ("resource", "action") VALUES
	('inventory', 'create'),
	('inventory', 'read'),
	('inventory', 'update'),
	('inventory', 'delete'),
	('inventory', 'import'),
	('inventory', 'export'),
	('payments', 'read'),
	('payments', 'update'),
	('payments', 'export'),
	('sales', 'export'),
	('stock_requests', 'create'),
	('stock_requests', 'read'),
	('stock_requests', 'update'),
	('stock_requests', 'approve'),
	('stock_requests', 'reject'),
	('transfer_orders', 'create'),
	('transfer_orders', 'read'),
	('transfer_orders', 'update'),
	('transfer_orders', 'approve')
ON CONFLICT ("resource", "action") DO NOTHING;
