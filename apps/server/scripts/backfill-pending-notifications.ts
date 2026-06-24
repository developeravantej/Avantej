/**
 * One-off: trigger notifyStaffOfPendingPackage for every existing pending
 * package. Useful after fixing a fan-out bug so already-pending packages
 * still surface in staff bell icons.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/backfill-pending-notifications.ts <orgSlug>
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { notifyStaffOfPendingPackage } from "@avantej-core/services/notification.service";
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
		console.error(
			"Usage: bun run scripts/backfill-pending-notifications.ts <orgSlug>",
		);
		process.exit(1);
	}
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const controlPool = new Pool({ connectionString: databaseUrl });
	const controlDb = drizzle({
		client: controlPool,
		schema: controlPanelSchema,
	});
	let tenantPool: Pool | null = null;

	try {
		const org = await controlDb.query.organizations.findFirst({
			where: (o, { eq }) => eq(o.slug, orgSlug),
		});
		if (!org) throw new Error(`Org not found: ${orgSlug}`);
		console.log(`📋 Org: ${org.name}\n`);

		tenantPool = new Pool({
			connectionString: decrypt(org.connectionString),
		});
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		const pending = await tenantDb.query.packageInstances.findMany({
			where: (p, { eq }) => eq(p.status, "pending"),
		});
		console.log(`Found ${pending.length} pending packages.\n`);

		let totalSent = 0;
		for (const p of pending) {
			const sent = await notifyStaffOfPendingPackage(
				// biome-ignore lint/suspicious/noExplicitAny: cross-package db type
				tenantDb as any,
				p.id,
			);
			console.log(
				`   pkg ${p.id} → ${sent} notification(s) ${sent === 0 ? "(skipped — no branch resolvable)" : "sent"}`,
			);
			totalSent += sent;
		}
		console.log(`\n✅ Done — ${totalSent} notifications inserted.`);
	} finally {
		if (tenantPool) await tenantPool.end();
		await controlPool.end();
	}
}

main().catch((err) => {
	console.error("❌ Failed:", err);
	process.exit(1);
});
