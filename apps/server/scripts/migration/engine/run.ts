/**
 * Migration engine — manifest → adapt → canonical → load → reconcile.
 *
 * Usage (from apps/server):
 *   bun run scripts/migration/engine/run.ts                         # DRY RUN, default org+client
 *   bun run scripts/migration/engine/run.ts --org <slug> --client pt-franchise
 *   bun run scripts/migration/engine/run.ts --file /path/to.xlsx    # override workbook
 *   bun run scripts/migration/engine/run.ts ... --commit            # WRITE (after a clean dry-run)
 *
 * Dry-run is the DEFAULT: the load runs in one transaction and rolls back unless
 * --commit is passed. Iterate on a throwaway Neon branch until reconciliation
 * passes, then commit against the real branch.
 */
import { loadDevVars } from "../lib/env";
import { connectTenant } from "../lib/db";
import { ensureCrosswalk } from "../core/crosswalk";
import { MigrationLog } from "../lib/log";
import { BatchInsertWriter } from "../core/writer";
import { countCheck, reportChecks } from "../core/reconcile";
import { resolveOrgRoot } from "../core/loaders/00-bootstrap";
import { loadLocations, linkBranchManagers } from "../core/loaders/01-location";
import { loadStaff } from "../core/loaders/02-staff";
import { loadServices } from "../core/loaders/03-product";
import { loadClients } from "../core/loaders/04-client";
import { loadAppointments } from "../core/loaders/07-appointment";
import type { ClientManifest } from "../core/canonical";
import { readSheet } from "../adapters/xlsx";
import { sql } from "drizzle-orm";

class DryRunRollback extends Error {}

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	const next = i >= 0 ? process.argv[i + 1] : undefined;
	return next && !next.startsWith("--") ? next : undefined;
}

async function main() {
	loadDevVars();

	const dryRun = !process.argv.includes("--commit");
	const orgSlug =
		arg("org") ?? process.env.MIGRATION_ORG_SLUG ?? "test-fitness-franchise";
	const clientSlug = arg("client") ?? "pt-franchise";

	const mod = (await import(`../adapters/clients/${clientSlug}/manifest`)) as {
		manifest: ClientManifest;
	};
	const manifest = mod.manifest;
	const sourceFile = arg("file") ?? manifest.sourceFile;

	console.log(`\n=== Avantej onboarding migration ===`);
	console.log(`client : ${manifest.slug}`);
	console.log(`org    : ${orgSlug}`);
	console.log(`file   : ${sourceFile}`);
	console.log(
		`mode   : ${dryRun ? "DRY RUN (rollback)" : "COMMIT (writes!)"}\n`,
	);

	// Adapt: read + map to canonical (no DB needed yet).
	const ectx = { defaultSourceSystem: manifest.defaultSourceSystem };
	const branchRows = await readSheet(sourceFile, manifest.branches.sheet);
	const branches = branchRows
		.map((r) => manifest.branches.toCanonical(r, ectx))
		.filter((b): b is NonNullable<typeof b> => b !== null);
	const staffRows = await readSheet(sourceFile, manifest.staff.sheet);
	const staff = staffRows
		.map((r) => manifest.staff.toCanonical(r, ectx))
		.filter((s): s is NonNullable<typeof s> => s !== null);
	const serviceRows = await readSheet(sourceFile, manifest.services.sheet);
	const services = serviceRows
		.map((r) => manifest.services.toCanonical(r, ectx))
		.filter((s): s is NonNullable<typeof s> => s !== null);
	const clientRows = await readSheet(sourceFile, manifest.clients.sheet);
	const clients = clientRows
		.map((r) => manifest.clients.toCanonical(r, ectx))
		.filter((c): c is NonNullable<typeof c> => c !== null);
	const appointmentRows = await readSheet(
		sourceFile,
		manifest.appointments.sheet,
	);
	const appointments = appointmentRows
		.map((r) => manifest.appointments.toCanonical(r, ectx))
		.filter((a): a is NonNullable<typeof a> => a !== null);
	console.log(
		`adapted: ${branches.length} branches, ${staff.length} staff, ${services.length} services, ${clients.length} clients, ${appointments.length} appointments\n`,
	);

	const conn = await connectTenant(orgSlug);
	console.log(`connected: ${conn.orgName} (${conn.orgId})\n`);

	const log = new MigrationLog();
	await ensureCrosswalk(conn.tenantDb); // DDL outside the load tx

	try {
		// Cross-DB: control-panel tx wraps the tenant tx so a dry-run rollback
		// (or any failure) discards BOTH. On success, tenant commits then CP.
		await conn.controlDb.transaction(async (cpTx) => {
			await conn.tenantDb.transaction(async (tx) => {
				const rootId = await resolveOrgRoot(tx);
				const writer = new BatchInsertWriter(tx);

				console.log("→ location → hierarchy tree");
				await loadLocations(branches, { tx, rootId, writer, log });

				console.log("→ staff → users + members");
				await loadStaff(staff, { cpTx, tx, orgId: conn.orgId, rootId, log });

				console.log("→ product → services");
				await loadServices(services, { tx, log });

				console.log("→ client → users + members + profiles");
				await loadClients(clients, {
					cpTx,
					tx,
					orgId: conn.orgId,
					rootId,
					log,
				});

				console.log("→ appointment → appointments");
				await loadAppointments(appointments, { tx, log });

				console.log("→ link branch managers (2nd pass)");
				await linkBranchManagers(branches, { tx, log });

				// Reconcile inside the tx (before rollback).
				const checks = [
					await countCheck(
						tx,
						"branch nodes for migrated ids",
						branches.length,
						sql`SELECT COUNT(*)::int AS count FROM mig_xwalk WHERE source_table = 'location'`,
					),
					await countCheck(
						tx,
						"tenant members for migrated staff",
						staff.length,
						sql`SELECT COUNT(*)::int AS count FROM mig_xwalk WHERE source_table = 'staff_member'`,
					),
					await countCheck(
						tx,
						"services for migrated products",
						services.length,
						sql`SELECT COUNT(*)::int AS count FROM mig_xwalk WHERE source_table = 'product'`,
					),
					await countCheck(
						tx,
						"users for migrated clients",
						clients.length,
						sql`SELECT COUNT(*)::int AS count FROM mig_xwalk WHERE source_table = 'client'`,
					),
					await countCheck(
						tx,
						"appointments migrated",
						appointments.length,
						sql`SELECT COUNT(*)::int AS count FROM mig_xwalk WHERE source_table = 'appointment'`,
					),
				];
				const ok = reportChecks(checks);
				if (!ok && !dryRun)
					throw new Error("reconciliation failed — aborting commit");

				if (dryRun) throw new DryRunRollback();
			});
		});
		log.summary();
		console.log("\n✓ COMMITTED");
	} catch (e) {
		if (e instanceof DryRunRollback) {
			log.summary();
			console.log("\n↩ DRY RUN — rolled back, nothing persisted.");
		} else {
			throw e;
		}
	} finally {
		await conn.close();
	}
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("\n✗ migration failed:", e);
		process.exit(1);
	});
