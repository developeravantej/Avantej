import { permissions } from "@avantej-core/db/schema/tenant/permissions";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

const SEED_PERMISSIONS = [
	// users
	{ resource: "users", action: "create" },
	{ resource: "users", action: "read" },
	{ resource: "users", action: "update" },
	{ resource: "users", action: "delete" },
	// roles
	{ resource: "roles", action: "create" },
	{ resource: "roles", action: "read" },
	{ resource: "roles", action: "update" },
	{ resource: "roles", action: "delete" },
	// branches
	{ resource: "branches", action: "create" },
	{ resource: "branches", action: "read" },
	{ resource: "branches", action: "update" },
	{ resource: "branches", action: "delete" },
	// reports
	{ resource: "reports", action: "read" },
	{ resource: "reports", action: "export" },
	// inventory
	{ resource: "inventory", action: "create" },
	{ resource: "inventory", action: "read" },
	{ resource: "inventory", action: "update" },
	{ resource: "inventory", action: "delete" },
	{ resource: "inventory", action: "import" },
	{ resource: "inventory", action: "export" },
	// appointments
	{ resource: "appointments", action: "create" },
	{ resource: "appointments", action: "read" },
	{ resource: "appointments", action: "update" },
	{ resource: "appointments", action: "delete" },
	// services
	{ resource: "services", action: "create" },
	{ resource: "services", action: "read" },
	{ resource: "services", action: "update" },
	{ resource: "services", action: "delete" },
	// sales
	{ resource: "sales", action: "create" },
	{ resource: "sales", action: "read" },
	{ resource: "sales", action: "update" },
	{ resource: "sales", action: "delete" },
	{ resource: "sales", action: "export" },
	// payments
	{ resource: "payments", action: "create" },
	{ resource: "payments", action: "read" },
	{ resource: "payments", action: "update" },
	{ resource: "payments", action: "export" },
	// stock_requests
	{ resource: "stock_requests", action: "create" },
	{ resource: "stock_requests", action: "read" },
	{ resource: "stock_requests", action: "update" },
	{ resource: "stock_requests", action: "approve" },
	{ resource: "stock_requests", action: "reject" },
	// transfer_orders
	{ resource: "transfer_orders", action: "create" },
	{ resource: "transfer_orders", action: "read" },
	{ resource: "transfer_orders", action: "update" },
	{ resource: "transfer_orders", action: "approve" },
	// role_management
	{ resource: "role_management", action: "create" },
	{ resource: "role_management", action: "read" },
	{ resource: "role_management", action: "update" },
	{ resource: "role_management", action: "delete" },
	// Note: customer_management is registered in seed-rbac.ts (canonical admin-grant file).
	// pos — POS orchestrator gate (tracking-pages P4); also in seed-rbac.ts for admin grant.
	{ resource: "pos", action: "create" },
	// refund_management (tracking-pages P5); also in seed-rbac.ts for admin grant.
	{
		resource: "refund_management",
		action: "read",
		description: "View refunds",
	},
	{
		resource: "refund_management",
		action: "create",
		description: "Request refunds",
	},
	{
		resource: "refund_management",
		action: "approve",
		description: "Approve or reject pending refunds",
	},
	{
		resource: "refund_management",
		action: "process",
		description:
			"Mark approved refunds as processed (write to payments/sales_orders)",
	},
	// commission_management (tracking-pages P6); also in seed-rbac.ts for admin grant.
	{
		resource: "commission_management",
		action: "read",
		description: "View commission ledger",
	},
	{
		resource: "commission_management",
		action: "update",
		description: "Edit commission split notes",
	},
	{
		resource: "commission_management",
		action: "approve",
		description: "Approve or void commission splits",
	},
	{
		resource: "commission_management",
		action: "process",
		description: "Mark commission splits as paid",
	},
];

export async function seedPermissions(
	tenantDb: NeonDatabase<typeof tenantSchema>,
): Promise<void> {
	await tenantDb
		.insert(permissions)
		.values(SEED_PERMISSIONS)
		.onConflictDoNothing();
}
