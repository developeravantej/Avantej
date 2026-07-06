#!/usr/bin/env bun
/**
 * Grant the page-guard permissions that were absent from the seeded RBAC catalogue.
 *
 * Root cause: packages/db/src/seed-rbac.ts `defaultPermissions` never seeded
 * `sales:read`, the `tax_configuration:*` actions, or the `class_slot_management:*`
 * actions — yet the route beforeLoad guards + oRPC procedures require them:
 *   - /dashboard/sales/view                  -> sales:read
 *   - /dashboard/settings/tax-rates          -> tax_configuration:update
 *   - /dashboard/appointment/class-slots/... -> class_slot_management:read
 * So the org OWNER (admin role) was redirected to /dashboard?unauthorized=true.
 *
 * seed-rbac.ts has since been fixed for NEW tenants. This script reconciles an
 * EXISTING tenant DB: inserts the missing `permissions` rows and grants them to
 * the `admin` role (admin also resolves perms via "select all permissions" at
 * runtime, so the rows alone unblock the frontend; the role_permissions grant
 * keeps backend requirePermissionOrpc checks correct too).
 *
 * Idempotent (check-then-insert, matching seedRBACData). Targets ONE tenant DB.
 *
 * Usage (from apps/server):
 *   DATABASE_URL=<tenant-conn> bun run scripts/grant-missing-page-permissions.ts          # dry run
 *   DATABASE_URL=<tenant-conn> bun run scripts/grant-missing-page-permissions.ts --apply  # write
 */
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// Actions verified against the actual guards + oRPC procedures (2026-07-01):
//   sales                 -> read/update/delete (create already seeded)
//   tax_configuration     -> read/create/update/delete (full CRUD)
//   class_slot_management -> read/create/update
const MISSING: Array<{ resource: string; action: string }> = [
	{ resource: "sales", action: "read" },
	{ resource: "sales", action: "update" },
	{ resource: "sales", action: "delete" },
	{ resource: "tax_configuration", action: "read" },
	{ resource: "tax_configuration", action: "create" },
	{ resource: "tax_configuration", action: "update" },
	{ resource: "tax_configuration", action: "delete" },
	{ resource: "class_slot_management", action: "read" },
	{ resource: "class_slot_management", action: "create" },
	{ resource: "class_slot_management", action: "update" },
	// /dashboard/access-control/roles + user-assignment guards and the roles
	// router — absent from every catalogue seeded before 2026-07-02.
	{ resource: "role_management", action: "read" },
	{ resource: "role_management", action: "create" },
	{ resource: "role_management", action: "update" },
	{ resource: "role_management", action: "delete" },
	// /dashboard/reports/view route guard + WS2 reports suite (list + CSV
	// export procedures) — absent from every catalogue seeded before WS2.
	{ resource: "reports", action: "read" },
	{ resource: "reports", action: "export" },
	// /dashboard/settings/import + data-import router (WS6) — new resource.
	{ resource: "data_import", action: "import" },
];

async function main(): Promise<void> {
	const apply = process.argv.includes("--apply");
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl)
		throw new Error("DATABASE_URL (tenant connection) required");

	const pool = new Pool({ connectionString: databaseUrl });
	try {
		const adminRow = await pool.query(
			"SELECT id FROM roles WHERE name = 'admin' LIMIT 1",
		);
		const adminRoleId = adminRow.rows[0]?.id as string | undefined;
		if (!adminRoleId) throw new Error("admin role not found in this tenant");

		console.log(
			`mode: ${apply ? "APPLY" : "DRY RUN"}   admin role: ${adminRoleId}`,
		);

		let permsAdded = 0;
		let grantsAdded = 0;

		for (const { resource, action } of MISSING) {
			const key = `${resource}:${action}`;

			// 1. ensure the permission row exists
			let permId: string | undefined = (
				await pool.query(
					"SELECT id FROM permissions WHERE resource = $1 AND action = $2 LIMIT 1",
					[resource, action],
				)
			).rows[0]?.id;

			if (!permId) {
				if (apply) {
					permId = (
						await pool.query(
							"INSERT INTO permissions (resource, action) VALUES ($1, $2) RETURNING id",
							[resource, action],
						)
					).rows[0].id;
				}
				permsAdded++;
				console.log(`  + permission ${key}${apply ? "" : " (would add)"}`);
			} else {
				console.log(`  = permission ${key} exists`);
			}

			// 2. ensure the admin grant exists
			if (permId) {
				const has = (
					await pool.query(
						"SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2 LIMIT 1",
						[adminRoleId, permId],
					)
				).rows.length;
				if (!has) {
					if (apply) {
						await pool.query(
							"INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)",
							[adminRoleId, permId],
						);
					}
					grantsAdded++;
					console.log(
						`    -> grant admin ${key}${apply ? "" : " (would grant)"}`,
					);
				}
			} else if (!apply) {
				// dry run and perm doesn't exist yet -> grant would follow after insert
				grantsAdded++;
				console.log(`    -> grant admin ${key} (would grant after insert)`);
			}
		}

		console.log(
			`\n${apply ? "APPLIED" : "DRY RUN"}: permissions +${permsAdded}, admin grants +${grantsAdded}`,
		);
		if (!apply) console.log("(pass --apply to write)");
	} finally {
		await pool.end();
	}
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("GRANT-ERROR", e);
		process.exit(1);
	});
