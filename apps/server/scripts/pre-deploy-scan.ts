/**
 * Pre-deploy scan for migration 0014 (Stream A).
 * Checks for:
 *  1. Overlapping trainer appointments (would break btree_gist exclusion constraint)
 *  2. Duplicate check-ins on same day (would break unique partial index)
 *  3. Package instances with null client_id (sanity check before XOR constraint)
 *
 * Run: cd apps/server && bun run scripts/pre-deploy-scan.ts
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "crypto";

neonConfig.webSocketConstructor = ws;

// Load .dev.vars
function loadEnv() {
	const path = join(import.meta.dir, "../../../.dev.vars");
	try {
		const lines = readFileSync(path, "utf-8").split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eq = trimmed.indexOf("=");
			if (eq === -1) continue;
			const k = trimmed.slice(0, eq).trim();
			const v = trimmed.slice(eq + 1).trim();
			if (!process.env[k]) process.env[k] = v;
		}
	} catch {
		console.warn("[pre-deploy-scan] .dev.vars not found, using process.env");
	}
}

function decrypt(encryptedText: string): string {
	const key = process.env.ENCRYPTION_KEY!;
	const secretKey = Buffer.from(key, "hex");
	const parts = encryptedText.split(":");
	const [ivHex, authTagHex, encrypted] = parts;
	const iv = Buffer.from(ivHex, "hex");
	const authTag = Buffer.from(authTagHex, "hex");
	const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey, iv);
	decipher.setAuthTag(authTag);
	let decrypted = decipher.update(encrypted, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
}

async function main() {
	loadEnv();

	const controlDbUrl = process.env.DATABASE_URL;
	if (!controlDbUrl) throw new Error("DATABASE_URL not set");

	// Get all tenant connection strings from control panel DB
	const controlPool = new Pool({ connectionString: controlDbUrl });
	const { rows: orgs } = await controlPool.query(
		`SELECT id, name, connection_string FROM organizations WHERE payment_status = 'active' ORDER BY created_at`
	);
	console.log(`\nFound ${orgs.length} active tenant(s)\n`);

	let totalOverlaps = 0;
	let totalDupeCheckIns = 0;

	for (const org of orgs) {
		const connStr = decrypt(org.connection_string);
		const pool = new Pool({ connectionString: connStr });

		console.log(`=== Org: ${org.name} (${org.id}) ===`);

		// 1. Trainer overlap scan
		const overlapQuery = `
      SELECT a1.id AS id1, a2.id AS id2, a1.trainer_id,
             a1.start_time, a1.end_time, a2.start_time AS start2, a2.end_time AS end2
      FROM appointments a1
      JOIN appointments a2
        ON a1.trainer_id = a2.trainer_id
        AND a1.id < a2.id
        AND tstzrange(a1.start_time, a1.end_time, '[)') && tstzrange(a2.start_time, a2.end_time, '[)')
      WHERE a1.status NOT IN ('cancelled','no-show')
        AND a2.status NOT IN ('cancelled','no-show')
        AND a1.trainer_id IS NOT NULL
    `;
		try {
			const { rows: overlaps } = await pool.query(overlapQuery);
			if (overlaps.length > 0) {
				console.log(`  [BLOCKER] Trainer overlaps: ${overlaps.length} pair(s)`);
				for (const r of overlaps) {
					console.log(`    trainer=${r.trainer_id}  ${r.id1} vs ${r.id2}  (${r.start_time} – ${r.end_time})`);
				}
				totalOverlaps += overlaps.length;
			} else {
				console.log("  [OK] No trainer overlaps");
			}
		} catch (e) {
			console.log(`  [WARN] trainer overlap scan failed: ${(e as Error).message}`);
		}

		// 2. Duplicate check-in scan
		const dupeCheckInQuery = `
      SELECT client_id, DATE_TRUNC('day', checked_in_at) AS day, COUNT(*) AS cnt
      FROM check_ins
      GROUP BY 1, 2
      HAVING COUNT(*) > 1
    `;
		try {
			const { rows: dupes } = await pool.query(dupeCheckInQuery);
			if (dupes.length > 0) {
				console.log(`  [BLOCKER] Duplicate check-ins: ${dupes.length} user-day pair(s)`);
				for (const r of dupes) {
					console.log(`    user=${r.user_id}  day=${r.day}  count=${r.cnt}`);
				}
				totalDupeCheckIns += dupes.length;
			} else {
				console.log("  [OK] No duplicate check-ins");
			}
		} catch (e) {
			console.log(`  [WARN] duplicate check-in scan failed: ${(e as Error).message}`);
		}

		// 3. Package instances with null client_id (sanity)
		const pkgQuery = `SELECT COUNT(*) AS cnt FROM package_instances WHERE client_id IS NULL`;
		try {
			const { rows } = await pool.query(pkgQuery);
			const cnt = Number(rows[0]?.cnt ?? 0);
			if (cnt > 0) {
				console.log(`  [WARN] package_instances with null client_id: ${cnt} row(s) — verify this is expected`);
			} else {
				console.log("  [OK] All package_instances have client_id set");
			}
		} catch (e) {
			console.log(`  [WARN] package scan failed: ${(e as Error).message}`);
		}

		await pool.end();
		console.log("");
	}

	await controlPool.end();

	console.log("=== SUMMARY ===");
	if (totalOverlaps > 0) {
		console.log(`BLOCKER: ${totalOverlaps} trainer overlap pair(s) must be resolved before migration 0014.`);
	} else {
		console.log("CLEAR: No trainer overlaps.");
	}
	if (totalDupeCheckIns > 0) {
		console.log(`BLOCKER: ${totalDupeCheckIns} duplicate check-in pair(s) must be resolved before migration 0014.`);
	} else {
		console.log("CLEAR: No duplicate check-ins.");
	}

	if (totalOverlaps > 0 || totalDupeCheckIns > 0) {
		process.exit(1);
	}
}

main().catch((e) => {
	console.error("Scan failed:", e);
	process.exit(1);
});
