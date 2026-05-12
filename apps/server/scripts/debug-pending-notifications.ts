/**
 * Debug helper for package-approval-flow.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/debug-pending-notifications.ts <orgSlug>
 *
 * Reports:
 * - Pending package_instances rows
 * - Their service's branchId
 * - Active admins/trainers in that branch
 * - Existing package_pending_review notification rows
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDevVars(): void {
	try {
		const v = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const l of v.split("\n")) {
			const m = l.trim().match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined && !process.env[m[1]])
				process.env[m[1]] = m[2];
		}
	} catch {}
}

async function main() {
	loadDevVars();
	const orgSlug = process.argv[2];
	if (!orgSlug) {
		console.error("Usage: bun run scripts/debug-pending-notifications.ts <orgSlug>");
		process.exit(1);
	}
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const controlPool = new Pool({ connectionString: databaseUrl });
	const controlDb = drizzle({ client: controlPool, schema: controlPanelSchema });
	let tenantPool: Pool | null = null;

	try {
		const org = await controlDb.query.organizations.findFirst({
			where: (o, { eq }) => eq(o.slug, orgSlug),
		});
		if (!org) throw new Error(`Org not found: ${orgSlug}`);
		console.log(`📋 Org: ${org.name} (${org.id})\n`);

		tenantPool = new Pool({ connectionString: decrypt(org.connectionString) });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		// 1. Pending package_instances
		const pending = await tenantDb.query.packageInstances.findMany({
			where: (p, { eq }) => eq(p.status, "pending"),
		});
		console.log(`🟡 Pending package_instances: ${pending.length}`);
		for (const p of pending.slice(-5)) {
			console.log(
				`   ${p.id}  serviceId=${p.serviceId}  source=${p.source}  clientId=${p.clientId}  createdAt=${p.createdAt}`,
			);
		}

		if (pending.length > 0) {
			// 2. Service branch lookup
			const lastPkg = pending[pending.length - 1];
			if (!lastPkg) {
				console.log(
					"\n   (no pending package returned in slice; skipping service lookup)",
				);
				return;
			}
			const svc = await tenantDb.query.services.findFirst({
				where: (s, { eq }) => eq(s.id, lastPkg.serviceId),
			});
			console.log(
				`\n🛠  Latest pending package's service: ${svc?.name ?? "(missing)"}  branchId=${svc?.branchId ?? "(NULL)"}`,
			);

			// 3. Active staff in branch
			if (svc?.branchId) {
				const staff = await tenantDb.query.members.findMany({
					where: (m, { and, eq, inArray }) =>
						and(
							eq(m.hierarchyScopeId, svc.branchId!),
							eq(m.status, "active"),
							inArray(m.role, ["admin", "trainer"]),
						),
				});
				console.log(`\n👥 Active admins/trainers in branch: ${staff.length}`);
				for (const s of staff) {
					console.log(
						`   member.id=${s.id}  userId=${s.userId}  role=${s.role}`,
					);
				}
			} else {
				console.log(`\n⚠  Service has NO branchId — fan-out skipped (returned 0).`);
			}

			// 4. Existing package_pending_review notifications for this pkg
			const notifs = await tenantDb.query.notifications.findMany({
				where: (n, { and, eq }) =>
					and(
						eq(n.relatedId, lastPkg.id),
						eq(n.type, "package_pending_review"),
					),
			});
			console.log(`\n🔔 package_pending_review notifications for this pkg: ${notifs.length}`);
			for (const n of notifs) {
				console.log(
					`   id=${n.id}  userId=${n.userId}  isRead=${n.isRead}  createdAt=${n.createdAt}`,
				);
			}
		}

		// 5. Org-wide count of package_pending_review notifications
		const all = await tenantDb.query.notifications.findMany({
			where: (n, { eq }) => eq(n.type, "package_pending_review"),
		});
		console.log(`\n📬 Total package_pending_review notifications in tenant: ${all.length}`);
	} finally {
		if (tenantPool) await tenantPool.end();
		await controlPool.end();
	}
}

main().catch((err) => {
	console.error("❌ Failed:", err);
	process.exit(1);
});
