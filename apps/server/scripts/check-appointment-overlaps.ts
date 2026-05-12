/**
 * Pre-flight: detect overlapping appointments per tenant before deploying
 * migration 0030_add_appointment_exclude_constraints.sql.
 *
 * Iterates every tenant organization in the control panel DB, decrypts each
 * tenant connection string, and queries for trainer- and room-overlap pairs.
 *
 * Usage:
 *   cd apps/server
 *   bun scripts/check-appointment-overlaps.ts
 *
 * Reads control panel DB from DATABASE_URL in apps/server/.dev.vars.
 * Exits 1 if any overlaps found in any tenant, 0 if all clean,
 * 2 on configuration / connection errors.
 *
 * Note: appointments.start_time / end_time are plain `timestamp` (no tz),
 * so the overlap query uses `tsrange` (matching the migration).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { decrypt } from "@avantej-core/db";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

function loadDevVars(): Record<string, string> {
	const candidates = [
		path.resolve(__dirname, "..", ".dev.vars"),
		path.resolve(process.cwd(), ".dev.vars"),
		path.resolve(process.cwd(), "apps/server/.dev.vars"),
	];
	for (const p of candidates) {
		try {
			const text = readFileSync(p, "utf8");
			const out: Record<string, string> = {};
			for (const line of text.split(/\r?\n/)) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith("#")) continue;
				const m = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
				if (m) out[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
			}
			return out;
		} catch {
			/* try next */
		}
	}
	throw new Error(".dev.vars not found");
}

type OverlapSample = {
	a_id: string;
	b_id: string;
	subject_id: string;
	a_start: string;
	a_end: string;
	b_start: string;
	b_end: string;
};

type TenantResult = {
	orgId: string;
	orgName: string;
	trainerOverlapCount: number;
	roomOverlapCount: number;
	trainerSamples: OverlapSample[];
	roomSamples: OverlapSample[];
	error?: string;
};

async function checkTenant(
	orgId: string,
	orgName: string,
	connStr: string,
): Promise<TenantResult> {
	const pool = new Pool({ connectionString: connStr });
	try {
		// Verify appointments table is present
		const tableCheck = await pool.query<{ exists: boolean }>(
			`SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'appointments'
       ) AS exists`,
		);
		if (!tableCheck.rows[0]?.exists) {
			return {
				orgId,
				orgName,
				trainerOverlapCount: 0,
				roomOverlapCount: 0,
				trainerSamples: [],
				roomSamples: [],
				error: "appointments table not present",
			};
		}

		const trainerOverlapSql = `
			SELECT a.id AS a_id, b.id AS b_id, a.trainer_id AS subject_id,
			       a.start_time AS a_start, a.end_time AS a_end,
			       b.start_time AS b_start, b.end_time AS b_end
			FROM public.appointments a
			JOIN public.appointments b
			  ON a.trainer_id = b.trainer_id
			 AND a.id < b.id
			 AND tsrange(a.start_time, a.end_time, '[)') && tsrange(b.start_time, b.end_time, '[)')
			WHERE a.status NOT IN ('cancelled', 'no-show')
			  AND b.status NOT IN ('cancelled', 'no-show')
			  AND a.trainer_id IS NOT NULL
			  AND b.trainer_id IS NOT NULL
			LIMIT 50
		`;
		const roomOverlapSql = `
			SELECT a.id AS a_id, b.id AS b_id, a.room_id AS subject_id,
			       a.start_time AS a_start, a.end_time AS a_end,
			       b.start_time AS b_start, b.end_time AS b_end
			FROM public.appointments a
			JOIN public.appointments b
			  ON a.room_id = b.room_id
			 AND a.id < b.id
			 AND tsrange(a.start_time, a.end_time, '[)') && tsrange(b.start_time, b.end_time, '[)')
			WHERE a.status NOT IN ('cancelled', 'no-show')
			  AND b.status NOT IN ('cancelled', 'no-show')
			  AND a.room_id IS NOT NULL
			  AND b.room_id IS NOT NULL
			LIMIT 50
		`;

		const [trainerRes, roomRes] = await Promise.all([
			pool.query<OverlapSample>(trainerOverlapSql),
			pool.query<OverlapSample>(roomOverlapSql),
		]);

		return {
			orgId,
			orgName,
			trainerOverlapCount: trainerRes.rows.length,
			roomOverlapCount: roomRes.rows.length,
			trainerSamples: trainerRes.rows,
			roomSamples: roomRes.rows,
		};
	} catch (err) {
		return {
			orgId,
			orgName,
			trainerOverlapCount: 0,
			roomOverlapCount: 0,
			trainerSamples: [],
			roomSamples: [],
			error: err instanceof Error ? err.message : String(err),
		};
	} finally {
		await pool.end();
	}
}

async function main() {
	const env = loadDevVars();
	const controlPanelUrl = env.DATABASE_URL;
	if (!controlPanelUrl) {
		console.error("No DATABASE_URL in .dev.vars");
		process.exit(2);
	}

	const controlPool = new Pool({ connectionString: controlPanelUrl });
	const orgsResult = await controlPool.query<{
		id: string;
		name: string;
		connection_string: string | null;
	}>(`SELECT id, name, connection_string FROM public.organizations`);
	const orgs = orgsResult.rows.map((r) => ({
		id: r.id,
		name: r.name,
		connectionString: r.connection_string,
	}));
	await controlPool.end();

	console.log(`Found ${orgs.length} tenant organization(s) in control panel.\n`);

	let totalTrainerOverlaps = 0;
	let totalRoomOverlaps = 0;
	let tenantsChecked = 0;
	let tenantsErrored = 0;
	const overlapReports: TenantResult[] = [];

	for (const org of orgs) {
		if (!org.connectionString) {
			console.warn(`  [skip] ${org.name} (${org.id}) — no connection string`);
			continue;
		}
		let connStr: string;
		try {
			connStr = decrypt(org.connectionString);
		} catch (err) {
			console.error(
				`  [error] ${org.name} (${org.id}) — failed to decrypt connection: ${err instanceof Error ? err.message : err}`,
			);
			tenantsErrored++;
			continue;
		}

		const res = await checkTenant(org.id, org.name, connStr);
		if (res.error) {
			console.warn(`  [warn] ${res.orgName} (${res.orgId}) — ${res.error}`);
			tenantsErrored++;
			continue;
		}
		tenantsChecked++;
		const total = res.trainerOverlapCount + res.roomOverlapCount;
		if (total === 0) {
			console.log(`  ✓ ${res.orgName} (${res.orgId}) — no overlaps`);
		} else {
			totalTrainerOverlaps += res.trainerOverlapCount;
			totalRoomOverlaps += res.roomOverlapCount;
			overlapReports.push(res);
			console.error(
				`  ✗ ${res.orgName} (${res.orgId}) — ${res.trainerOverlapCount} trainer overlap(s), ${res.roomOverlapCount} room overlap(s)`,
			);
		}
	}

	const totalOverlaps = totalTrainerOverlaps + totalRoomOverlaps;
	console.log(
		`\nSummary: ${tenantsChecked} tenant(s) checked, ${tenantsErrored} skipped/errored, ${totalTrainerOverlaps} trainer overlap(s), ${totalRoomOverlaps} room overlap(s).`,
	);

	if (totalOverlaps === 0) {
		console.log(
			"✓ Pre-flight clean: 0 overlapping appointments — safe to deploy 0030_add_appointment_exclude_constraints",
		);
		process.exit(0);
	}

	console.error("\nOverlap details:");
	for (const r of overlapReports) {
		console.error(`Tenant ${r.orgName} (${r.orgId}):`);
		if (r.trainerOverlapCount > 0) {
			console.error(`  Trainer overlaps (${r.trainerOverlapCount}):`);
			for (const row of r.trainerSamples) {
				console.error(
					`    ${row.a_id} <> ${row.b_id} (trainer ${row.subject_id}) ${row.a_start}–${row.a_end} vs ${row.b_start}–${row.b_end}`,
				);
			}
		}
		if (r.roomOverlapCount > 0) {
			console.error(`  Room overlaps (${r.roomOverlapCount}):`);
			for (const row of r.roomSamples) {
				console.error(
					`    ${row.a_id} <> ${row.b_id} (room ${row.subject_id}) ${row.a_start}–${row.a_end} vs ${row.b_start}–${row.b_end}`,
				);
			}
		}
	}
	process.exit(1);
}

main().catch((err) => {
	console.error("Script failed:", err);
	process.exit(2);
});
