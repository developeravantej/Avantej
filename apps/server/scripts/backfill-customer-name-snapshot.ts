/**
 * Script: Backfill customer_name snapshots on appointments + package_instances
 *
 * Migration 0082 added a nullable `customer_name` column to both tables for
 * read-scaling (avoids cross-DB name lookups on list renders). New rows are
 * populated at create time and refreshed forward-only on customer rename.
 * This script populates the column for EXISTING rows so legacy rows stop
 * falling back to the live cross-DB lookup.
 *
 * Behaviour matches the runtime rules:
 *   - appointments: backfill all rows with a userId (the name as it is NOW).
 *   - package_instances: backfill all rows with a clientId.
 *   - Only touches rows where customer_name IS NULL (idempotent / re-runnable).
 *   - Walk-in rows (no client user) are skipped — they keep their own naming.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/backfill-customer-name-snapshot.ts [--dry-run] [--filter=slug]
 */

import { decrypt } from "@avantej-core/db";
import { refreshTenantCustomerNameSnapshots } from "@avantej-core/services";
import { getControlPanelDb } from "../src/lib/db";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, inArray, isNull, isNotNull } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const [key, ...valueParts] = trimmed.split("=");
			if (key && valueParts.length > 0) {
				process.env[key.trim()] = valueParts
					.join("=")
					.trim()
					.replace(/^["']|["']$/g, "");
			}
		}
	} catch (error) {
		console.warn("Could not load .dev.vars file:", error);
	}
}

loadDevVars();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
// --refresh: after filling NULL snapshots, also re-resolve forward-facing rows and
// overwrite any whose snapshot has drifted from the live name (heals rename paths
// that bypassed the forward-propagate). No-op writes are skipped.
const refresh = args.includes("--refresh");
const filterArg = args.find((a) => a.startsWith("--filter="));
const filter = filterArg ? filterArg.split("=")[1] : null;

type TenantDb = ReturnType<typeof drizzle<typeof tenantSchema>>;

/** Resolve a set of control-panel user IDs to a name map (batched). */
async function resolveNames(
	controlPanelDb: ReturnType<typeof getControlPanelDb>,
	userIds: string[],
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (userIds.length === 0) return map;
	// Chunk to keep IN lists reasonable.
	const CHUNK = 500;
	for (let i = 0; i < userIds.length; i += CHUNK) {
		const slice = userIds.slice(i, i + CHUNK);
		const rows = await controlPanelDb
			.select({ id: cpUsers.id, name: cpUsers.name })
			.from(cpUsers)
			.where(inArray(cpUsers.id, slice));
		for (const r of rows) map.set(r.id, r.name);
	}
	return map;
}

async function backfillTenant(
	tenantDb: TenantDb,
	controlPanelDb: ReturnType<typeof getControlPanelDb>,
): Promise<{ appts: number; pkgs: number }> {
	// 1) Appointments missing a snapshot but linked to a client user.
	const apptRows = await tenantDb
		.select({ id: appointments.id, userId: appointments.userId })
		.from(appointments)
		.where(
			and(isNull(appointments.customerName), isNotNull(appointments.userId)),
		);

	// 2) Packages missing a snapshot but linked to a client user.
	const pkgRows = await tenantDb
		.select({ id: packageInstances.id, clientId: packageInstances.clientId })
		.from(packageInstances)
		.where(
			and(
				isNull(packageInstances.customerName),
				isNotNull(packageInstances.clientId),
			),
		);

	const allUserIds = [
		...new Set([
			...apptRows.map((r) => r.userId).filter((v): v is string => !!v),
			...pkgRows.map((r) => r.clientId).filter((v): v is string => !!v),
		]),
	];
	const nameMap = await resolveNames(controlPanelDb, allUserIds);

	let appts = 0;
	let pkgs = 0;

	if (!dryRun) {
		// Group appointment IDs by resolved name → one UPDATE per distinct name.
		const apptByName = new Map<string, string[]>();
		for (const r of apptRows) {
			const name = r.userId ? nameMap.get(r.userId) : undefined;
			if (!name) continue;
			(apptByName.get(name) ?? apptByName.set(name, []).get(name)!).push(r.id);
		}
		for (const [name, ids] of apptByName) {
			for (let i = 0; i < ids.length; i += 500) {
				const slice = ids.slice(i, i + 500);
				await tenantDb
					.update(appointments)
					.set({ customerName: name })
					.where(inArray(appointments.id, slice));
				appts += slice.length;
			}
		}

		const pkgByName = new Map<string, string[]>();
		for (const r of pkgRows) {
			const name = r.clientId ? nameMap.get(r.clientId) : undefined;
			if (!name) continue;
			(pkgByName.get(name) ?? pkgByName.set(name, []).get(name)!).push(r.id);
		}
		for (const [name, ids] of pkgByName) {
			for (let i = 0; i < ids.length; i += 500) {
				const slice = ids.slice(i, i + 500);
				await tenantDb
					.update(packageInstances)
					.set({ customerName: name })
					.where(inArray(packageInstances.id, slice));
				pkgs += slice.length;
			}
		}
	} else {
		appts = apptRows.filter((r) => r.userId && nameMap.get(r.userId)).length;
		pkgs = pkgRows.filter((r) => r.clientId && nameMap.get(r.clientId)).length;
	}

	// --refresh: heal drift on forward-facing rows that already carry a (stale) snapshot.
	if (refresh && !dryRun) {
		const healed = await refreshTenantCustomerNameSnapshots(
			tenantDb,
			controlPanelDb,
		);
		appts += healed.appointments;
		pkgs += healed.packages;
	}

	return { appts, pkgs };
}

async function main() {
	const controlPanelDb = getControlPanelDb();

	console.log(`\nCustomer Name Snapshot Backfill`);
	console.log(`================================`);
	console.log(`Dry run: ${dryRun}`);
	if (filter) console.log(`Filter: ${filter}`);

	let allOrgs = await controlPanelDb.query.organizations.findMany({
		orderBy: (orgs, { desc }) => desc(orgs.createdAt),
	});
	if (filter) allOrgs = allOrgs.filter((org) => org.slug.includes(filter));

	console.log(`\nFound ${allOrgs.length} organization(s)\n`);

	let totalAppts = 0;
	let totalPkgs = 0;

	for (const org of allOrgs) {
		if (!org.connectionString) {
			console.log(`- ${org.slug}: SKIP (no connection string)`);
			continue;
		}
		let pool: Pool | null = null;
		try {
			const connectionString = decrypt(org.connectionString);
			pool = new Pool({ connectionString });
			const tenantDb = drizzle({ client: pool, schema: tenantSchema });
			const { appts, pkgs } = await backfillTenant(tenantDb, controlPanelDb);
			totalAppts += appts;
			totalPkgs += pkgs;
			console.log(
				`- ${org.slug}: ${dryRun ? "would backfill" : "backfilled"} ${appts} appointment(s), ${pkgs} package(s)`,
			);
		} catch (err) {
			console.error(
				`- ${org.slug}: ERROR`,
				err instanceof Error ? err.message : err,
			);
		} finally {
			if (pool) await pool.end().catch(() => {});
		}
	}

	console.log(
		`\nDone. ${dryRun ? "Would update" : "Updated"} ${totalAppts} appointment(s) and ${totalPkgs} package(s) across ${allOrgs.length} tenant(s).`,
	);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
